import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index";
import { channels, serverMembers } from "../db/schema";
import { untracedDbQuery } from "../tracing/dbQueryTrace";
import type { ActivityReadSource } from "./activityReadSource";
import type {
  ActivityUnreadTotals,
  AgentInboxChainReadOptions,
  AgentInboxChainRow,
  AgentInboxChainSeqRow,
  AgentInboxTotals,
  FollowedThreadRwRow,
  FollowedThreadStatsRow,
} from "./channelService";
import type {
  ConversationUnreadRow,
  ConversationUnreadSource,
  ConversationUnreadSummaryQuery,
  SidebarUnreadTotalsQuery,
} from "./conversationUnreadSource";

const NOISE_SUBTYPES = sql`('channel.self_unfollow_thread', 'task.deleted_summary')`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Production PostgreSQL Activity / followed-threads read source used when
 * `RAFT_INBOX_BACKEND=postgres` is enabled.
 */
export const postgresActivityReadSource: ActivityReadSource = {
  async inboxItems(serverId, userId, query) {
    const { getInboxItems } = await import("./channelService");
    return getInboxItems(serverId, userId, { ...query, forceCanonicalPostgres: true });
  },

  async activityUnreadTotals(inputs, userId, opts) {
    const { getInboxItems } = await import("./channelService");
    const memberRows = await getDb()
      .select({ serverId: serverMembers.serverId })
      .from(serverMembers)
      .where(and(
        eq(serverMembers.userId, userId),
        inArray(serverMembers.serverId, inputs.map((input) => input.serverId)),
      ));
    const memberServerIds = new Set(memberRows.map((row) => row.serverId));
    const totalsByServer = new Map<string, ActivityUnreadTotals>();
    for (const input of inputs) {
      if (!memberServerIds.has(input.serverId)) continue;
      const result = await getInboxItems(input.serverId, userId, {
        filter: "all",
        limit: 1,
        offset: 0,
        historyCutoff: input.historyCutoff,
        traceQuery: opts.traceQuery,
        forceCanonicalPostgres: true,
      });
      totalsByServer.set(input.serverId, {
        totalUnreadCount: result.totalUnreadCount,
        activeUnreadCount: result.activeUnreadCount,
      });
    }
    return totalsByServer;
  },

  async followedThreadStats({ userId, threads, traceQuery }) {
    const { getFollowedThreadStatsFromPostgres } = await import("./channelService");
    return getFollowedThreadStatsFromPostgres(userId, threads, undefined, traceQuery, "none");
  },

  async followedThreadRows({ serverId, userId, traceQuery }) {
    const { getFollowedThreadStatsFromPostgres } = await import("./channelService");
    const readRows = async (): Promise<FollowedThreadRwRow[]> => {
      const threadRows = (await getDb().execute(sql`
        WITH followed_threads AS (
          SELECT
            t.id AS thread_channel_id,
            COALESCE(canonical_thread.id, t.id) AS storage_thread_channel_id,
            COALESCE(t.parent_message_id, canonical_thread.parent_message_id) AS parent_message_id,
            (canonical_thread.id IS NOT NULL) AS joint_projection
          FROM thread_follows tf
          JOIN channels t
            ON t.id = tf.thread_channel_id AND t.type = 'thread' AND t.deleted_at IS NULL
          LEFT JOIN joint_channel_servers thread_projection
            ON thread_projection.local_channel_id = t.id
           AND thread_projection.server_id = t.server_id
           AND thread_projection.status = 'active'
          LEFT JOIN joint_channels thread_joint
            ON thread_joint.id = thread_projection.joint_channel_id AND thread_joint.status = 'active'
          LEFT JOIN channels canonical_thread
            ON canonical_thread.id = thread_joint.canonical_channel_id
           AND canonical_thread.type = 'thread'
           AND canonical_thread.deleted_at IS NULL
          WHERE tf.follower_type = 'user'
            AND tf.follower_id = ${userId}
            AND t.server_id = ${serverId}
        )
        SELECT
          ft.thread_channel_id::text AS "threadChannelId",
          ft.storage_thread_channel_id::text AS "storageThreadChannelId",
          ft.parent_message_id::text AS "parentMessageId",
          parent.channel_id::text AS "parentChannelId",
          parent_ch.server_id::text AS "parentServerId",
          SUBSTR(parent.content, 1, 141) AS "parentMessageContent",
          parent.sender_type AS "parentMessageSenderType",
          parent.sender_id AS "parentMessageSenderId",
          parent.seq::text AS "parentMessageSeq",
          CASE
            WHEN parent.created_at IS NULL THEN NULL::text
            ELSE to_char(parent.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'
          END AS "parentMessageCreatedAt",
          task.id::text AS "taskId",
          task.task_number::int AS "taskNumber",
          task.status AS "taskStatus",
          task.claimed_by_type AS "taskClaimedByType",
          task.claimed_by_id AS "taskClaimedById",
          ft.joint_projection AS "jointProjection",
          parent_projection.local_channel_id::text AS "jointParentChannelId"
        FROM followed_threads ft
        LEFT JOIN messages parent ON parent.id = ft.parent_message_id
        LEFT JOIN channels parent_ch ON parent_ch.id = parent.channel_id
        LEFT JOIN tasks task ON task.message_id = parent.id
        LEFT JOIN joint_channels parent_joint
          ON parent_joint.canonical_channel_id = parent.channel_id AND parent_joint.status = 'active'
        LEFT JOIN joint_channel_servers parent_projection
          ON parent_projection.joint_channel_id = parent_joint.id
         AND parent_projection.server_id = ${serverId}
         AND parent_projection.status = 'active'
      `)).rows as unknown as Array<Omit<FollowedThreadRwRow, keyof FollowedThreadStatsRow> & { threadChannelId: string }>;
      if (threadRows.length === 0) return [];
      const statsRows = await getFollowedThreadStatsFromPostgres(
        userId,
        threadRows.map((row) => ({
          threadChannelId: row.threadChannelId,
          storageThreadChannelId: row.storageThreadChannelId,
        })),
        undefined,
        untracedDbQuery,
        "none",
      );
      const statsByThread = new Map(statsRows.map((row) => [row.threadChannelId, row]));
      return threadRows.map((row): FollowedThreadRwRow => {
        const stats = statsByThread.get(row.threadChannelId)!;
        return {
          ...row,
          ...stats,
          lastReplyContent: stats.lastReplyContent == null
            ? null
            : Array.from(stats.lastReplyContent).slice(0, 141).join(""),
        };
      });
    };
    return traceQuery(
      "channels.followed_threads_rw_rows",
      readRows,
      (rows) => ({ backend: "postgres", rows_count: rows.length }),
    );
  },
};

function mapConversationUnreadRows(rows: Record<string, unknown>[], hasNew: boolean): ConversationUnreadRow[] {
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  return rows.map((row) => ({
    serverId: String(row.server_id),
    targetId: String(row.target_id),
    kind: row.kind as ConversationUnreadRow["kind"],
    subscribed: row.subscribed === true,
    unreadCount: Number(row.unread_count),
    mentionUnread: Number(row.mention_unread),
    totalMentions: Number(row.total_mentions),
    hasNew,
    latestSeq: text(row.latest_seq),
    latestMessageId: text(row.latest_message_id),
    cursorPresent: row.cursor_present === true,
    lastReadSeq: text(row.last_read_seq),
    readStateVersion: row.read_state_version === null || row.read_state_version === undefined
      ? null
      : Number(row.read_state_version),
  }));
}

/**
 * Derive sidebar conversation unread rows (`rw_conversation_unread_v4` semantics)
 * directly from PostgreSQL for one user across `serverIds`.
 */
export async function postgresConversationUnreadViewRows(
  userId: string,
  serverIds: readonly string[],
): Promise<ConversationUnreadRow[]> {
  if (serverIds.length === 0 || !CANONICAL_UUID_RE.test(userId)) return [];
  const user = sql`${userId}::uuid`;
  const servers = sql`ARRAY[${sql.join(serverIds.map((id) => sql`${id}::text`), sql`, `)}]::text[]`;
  const unreadPredicate = sql`m.seq > COALESCE(rc.last_read_seq, 0)
    AND NOT (m.sender_type = 'user' AND m.sender_id = ${userId}::text)
    AND NOT COALESCE(m.message_type = 'system' AND m.causal_actor_type = 'user' AND m.causal_actor_id = ${userId}::text, FALSE)
    AND (m.system_subtype IS NULL OR m.system_subtype NOT IN ${NOISE_SUBTYPES})`;

  const result = await getDb().execute(sql`
    WITH proj AS (
      SELECT s.local_channel_id, s.server_id, j.canonical_channel_id
      FROM joint_channel_servers AS s
      JOIN joint_channels AS j ON j.id = s.joint_channel_id
      WHERE s.status = 'active' AND j.status = 'active'
    ), receiver_cursors AS (
      SELECT channel_id, CAST(last_read_seq AS BIGINT) AS last_read_seq
      FROM user_channel_read_cursors
      WHERE user_id = ${user}
    ), subs AS (
      SELECT CASE WHEN c.type = 'dm' THEN 'dm' ELSE 'channel' END AS kind, c.id AS target_id, c.server_id,
             st.done_at
      FROM channel_humans AS ch
      JOIN channels AS c ON ch.channel_id = c.id AND c.type <> 'thread'
       AND c.deleted_at IS NULL AND c.archived_at IS NULL
      LEFT JOIN inbox_target_mute_states AS mu
        ON mu.receiver_type = 'user' AND mu.receiver_id = ch.user_id
       AND mu.source_channel_id = c.id AND mu.activity_muted
      LEFT JOIN user_channel_inbox_states AS st
        ON st.user_id = ch.user_id AND st.channel_id = c.id
      WHERE ch.user_id = ${user} AND mu.receiver_id IS NULL AND c.server_id::text = ANY(${servers})
      UNION ALL
      SELECT 'thread', c.id, c.server_id, tf.done_at
      FROM thread_follows AS tf
      JOIN channels AS c ON tf.thread_channel_id = c.id
       AND c.deleted_at IS NULL AND c.archived_at IS NULL
      WHERE tf.follower_type = 'user' AND tf.follower_id = ${user} AND tf.unfollowed_at IS NULL
        AND tf.done_at IS NULL AND c.server_id::text = ANY(${servers})
    ), muted_subs AS (
      SELECT CASE WHEN c.type = 'dm' THEN 'dm' ELSE 'channel' END AS kind, c.id AS target_id, c.server_id,
             st.done_at
      FROM channel_humans AS ch
      JOIN channels AS c ON ch.channel_id = c.id AND c.type <> 'thread'
       AND c.deleted_at IS NULL AND c.archived_at IS NULL
      JOIN inbox_target_mute_states AS mu
        ON mu.receiver_type = 'user' AND mu.receiver_id = ch.user_id
       AND mu.source_channel_id = c.id AND mu.activity_muted
      LEFT JOIN user_channel_inbox_states AS st
        ON st.user_id = ch.user_id AND st.channel_id = c.id
      WHERE ch.user_id = ${user} AND c.server_id::text = ANY(${servers})
    ), mention_storage AS (
      SELECT m.channel_id, m.message_seq, COALESCE(pj.canonical_channel_id, m.channel_id) AS storage_id,
             (m.notifiable_at_send OR m.notified_at IS NOT NULL) AS notifies
      FROM message_mentions AS m
      LEFT JOIN proj AS pj ON pj.local_channel_id = m.channel_id
      WHERE m.target_type = 'user' AND m.target_id = ${user}
    ), mention_map AS (
      SELECT c.id AS storage_id, c.id AS target_id, FALSE AS projected
      FROM channels AS c
      WHERE c.id IN (SELECT storage_id FROM mention_storage)
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM proj AS p WHERE p.local_channel_id = c.id)
      UNION ALL
      SELECT p.canonical_channel_id, p.local_channel_id, TRUE
      FROM proj AS p
      WHERE p.canonical_channel_id IN (SELECT storage_id FROM mention_storage)
    ), cand AS (
      SELECT target_id FROM subs
      UNION
      SELECT target_id FROM muted_subs
      UNION
      SELECT map.target_id
      FROM mention_map AS map
      WHERE (SELECT c.server_id::text FROM channels AS c
             WHERE c.id = map.target_id AND c.deleted_at IS NULL AND c.archived_at IS NULL) = ANY(${servers})
    ), target_latest AS (
      SELECT t.target_id, t.storage_id, lt.seq AS latest_seq, lt.id AS latest_message_id,
             (lt.seq IS NULL OR t.plan <> 'free' OR l.latest_at > NOW() - INTERVAL '30 days') AS eligible
      FROM (
        SELECT c.id AS target_id, COALESCE(sv.plan, 'free') AS plan,
               CASE WHEN p.local_channel_id IS NOT NULL THEN p.canonical_channel_id
                    WHEN c.deleted_at IS NULL AND c.archived_at IS NULL THEN c.id END AS storage_id
        FROM cand AS k
        JOIN channels AS c ON c.id = k.target_id
        LEFT JOIN proj AS p ON p.local_channel_id = c.id
        LEFT JOIN servers AS sv ON sv.id = c.server_id
      ) AS t
      LEFT JOIN LATERAL (
        SELECT m.seq, m.id FROM messages AS m WHERE m.channel_id = t.storage_id ORDER BY m.seq DESC LIMIT 1
      ) AS lt ON TRUE
      CROSS JOIN LATERAL (
        SELECT CASE WHEN t.plan = 'free'
                    THEN (SELECT MAX(m.created_at) FROM messages AS m WHERE m.channel_id = t.storage_id) END AS latest_at
      ) AS l
    ), target_unread AS (
      SELECT tl.target_id,
             (SELECT COUNT(*) FROM messages AS m
              WHERE m.channel_id = tl.storage_id AND ${unreadPredicate}
                AND (m.message_type = 'chat'
                     OR NOT EXISTS (SELECT 1 FROM channels AS tc WHERE tc.id = tl.target_id AND tc.type = 'task'))) AS unread
      FROM target_latest AS tl
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = tl.target_id
      WHERE tl.eligible
        AND tl.target_id IN (SELECT target_id FROM subs UNION ALL SELECT target_id FROM muted_subs)
    ), normal AS (
      SELECT s.kind, s.target_id, s.server_id, s.done_at,
             MAX(g.latest_seq) AS latest_seq,
             CAST(SUM(COALESCE(tu.unread, 0)) AS BIGINT) AS unread_count
      FROM subs AS s
      JOIN target_latest AS g ON g.target_id = s.target_id AND g.eligible
      LEFT JOIN target_unread AS tu ON tu.target_id = s.target_id
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = s.target_id
      GROUP BY s.kind, s.target_id, s.server_id, s.done_at, rc.last_read_seq
    ), muted_full AS (
      SELECT s.kind, s.target_id, s.server_id, s.done_at,
             MAX(g.latest_seq) AS latest_seq,
             CAST(SUM(COALESCE(tu.unread, 0)) AS BIGINT) AS unread_count
      FROM muted_subs AS s
      JOIN target_latest AS g ON g.target_id = s.target_id AND g.eligible
      LEFT JOIN target_unread AS tu ON tu.target_id = s.target_id
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = s.target_id
      GROUP BY s.kind, s.target_id, s.server_id, s.done_at, rc.last_read_seq
    ), thread_parent AS (
      SELECT c.id AS thread_channel_id, m.channel_id AS parent_channel_id
      FROM channels AS c
      JOIN messages AS m ON m.id = c.parent_message_id
      JOIN channels AS pc ON pc.id = m.channel_id
      LEFT JOIN proj AS px ON px.local_channel_id = c.id
      WHERE c.type = 'thread' AND px.local_channel_id IS NULL AND c.id IN (SELECT target_id FROM cand)
      UNION ALL
      SELECT lt.id, COALESCE(pl.local_channel_id, m.channel_id)
      FROM channels AS lt
      JOIN proj AS p ON p.local_channel_id = lt.id
      JOIN channels AS ct ON ct.id = p.canonical_channel_id
      JOIN messages AS m ON m.id = ct.parent_message_id
      LEFT JOIN proj AS pl ON pl.canonical_channel_id = m.channel_id AND pl.server_id = lt.server_id
      JOIN channels AS pc2 ON pc2.id = COALESCE(pl.local_channel_id, m.channel_id)
      WHERE lt.type = 'thread' AND lt.id IN (SELECT target_id FROM cand)
      UNION ALL
      SELECT tc.id, tc.parent_channel_id
      FROM channels AS tc
      JOIN channels AS tpc ON tpc.id = tc.parent_channel_id
      WHERE tc.type = 'task' AND tc.id IN (SELECT target_id FROM cand)
    ), mention_vis AS (
      SELECT map.storage_id, map.target_id, map.projected, c.type, c.server_id,
             EXISTS (SELECT 1 FROM channel_humans AS visu
                     WHERE visu.channel_id = map.target_id AND visu.user_id = ${user}) AS member,
             (tp.parent_channel_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM channel_humans AS pvisu
               WHERE pvisu.channel_id = tp.parent_channel_id AND pvisu.user_id = ${user})) AS parent_member,
             EXISTS (SELECT 1 FROM thread_follows AS mf
                     WHERE mf.thread_channel_id = map.target_id AND mf.follower_type = 'user'
                       AND mf.follower_id = ${user} AND mf.unfollowed_at IS NULL) AS following
      FROM mention_map AS map
      JOIN target_latest AS g ON g.target_id = map.target_id AND g.eligible
      JOIN channels AS c ON c.id = map.target_id AND c.deleted_at IS NULL AND c.archived_at IS NULL
      LEFT JOIN thread_parent AS tp ON tp.thread_channel_id = map.target_id
      WHERE c.server_id::text = ANY(${servers})
    ), mention AS (
      SELECT CASE WHEN v.type IN ('thread', 'task') THEN 'thread' WHEN v.type = 'dm' THEN 'dm' ELSE 'channel' END AS kind,
             v.target_id, v.server_id,
             COUNT(*) FILTER (WHERE mm.message_seq > COALESCE(rc.last_read_seq, 0) AND mm.notifies) AS mention_unread,
             COUNT(*) AS total_mentions
      FROM mention_storage AS mm
      JOIN mention_vis AS v ON v.storage_id = mm.storage_id
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = v.target_id
      WHERE (v.type NOT IN ('thread', 'task') AND v.member)
         OR (v.type IN ('thread', 'task') AND (v.parent_member OR v.following))
         OR (NOT v.projected AND EXISTS (
               SELECT 1 FROM message_mentions AS nm
               WHERE nm.target_type = 'user' AND nm.target_id = ${user}
                 AND nm.channel_id = mm.channel_id AND nm.message_seq = mm.message_seq
                 AND nm.notified_at IS NOT NULL))
      GROUP BY 1, 2, 3
    ), n AS (
      SELECT kind, target_id, server_id, done_at, latest_seq, unread_count FROM normal
      UNION ALL
      SELECT kind, target_id, server_id, done_at, latest_seq, unread_count FROM muted_full
    ), u AS (
      SELECT COALESCE(n.kind, mn.kind) AS kind,
             COALESCE(n.target_id, mn.target_id) AS target_id,
             COALESCE(n.server_id, mn.server_id) AS server_id,
             (n.target_id IS NOT NULL) AS subscribed,
             n.done_at,
             n.latest_seq,
             COALESCE(n.unread_count, 0) AS unread_count,
             COALESCE(mn.mention_unread, 0) AS mention_unread,
             COALESCE(mn.total_mentions, 0) AS total_mentions
      FROM n
      FULL JOIN mention AS mn ON mn.target_id = n.target_id
    )
    SELECT u.server_id::text AS server_id, u.target_id::text AS target_id,
           CASE WHEN u.kind = 'thread' AND uc_target.type = 'task' THEN 'task' ELSE u.kind END AS kind,
           u.subscribed,
           u.unread_count, u.mention_unread, u.total_mentions,
           COALESCE(u.latest_seq, tl.latest_seq)::text AS latest_seq,
           tl.latest_message_id::text AS latest_message_id,
           (uc.user_id IS NOT NULL) AS cursor_present,
           CAST(uc.last_read_seq AS BIGINT)::text AS last_read_seq,
           uc.read_state_version
    FROM u
    LEFT JOIN channels AS uc_target ON uc_target.id = u.target_id
    LEFT JOIN target_latest AS tl ON tl.target_id = u.target_id
    LEFT JOIN user_channel_read_cursors AS uc ON uc.user_id = ${user} AND uc.channel_id = u.target_id
    LEFT JOIN thread_parent AS tp ON tp.thread_channel_id = u.target_id AND u.kind = 'thread'
    LEFT JOIN channels AS pc ON pc.id = tp.parent_channel_id
    LEFT JOIN channel_humans AS pch ON pch.channel_id = tp.parent_channel_id AND pch.user_id = ${user}
    WHERE u.server_id::text = ANY(${servers})
      AND (u.kind <> 'thread'
        OR (u.subscribed AND u.done_at IS NULL
            AND pc.id IS NOT NULL AND pc.deleted_at IS NULL AND pc.archived_at IS NULL
            AND (pc.type = 'channel' OR pch.user_id IS NOT NULL)))
  `);
  return mapConversationUnreadRows((result as unknown as { rows: Record<string, unknown>[] }).rows, false);
}

async function postgresPublicHasNewRows(userId: string, serverId: string): Promise<ConversationUnreadRow[]> {
  if (!CANONICAL_UUID_RE.test(userId) || !CANONICAL_UUID_RE.test(serverId)) return [];
  const user = sql`${userId}::uuid`;
  const result = await getDb().execute(sql`
    WITH proj AS (
      SELECT s.local_channel_id, j.canonical_channel_id
      FROM joint_channel_servers AS s
      JOIN joint_channels AS j ON j.id = s.joint_channel_id
      WHERE s.status = 'active' AND j.status = 'active'
    ), candidate AS (
      SELECT c.id, c.server_id, COALESCE(sv.plan, 'free') AS plan,
             COALESCE(p.canonical_channel_id, c.id) AS storage_id
      FROM channels AS c
      LEFT JOIN servers AS sv ON sv.id = c.server_id
      LEFT JOIN channel_humans AS ch ON ch.channel_id = c.id AND ch.user_id = ${user}
      LEFT JOIN proj AS p ON p.local_channel_id = c.id
      WHERE c.server_id = ${serverId}::uuid
        AND c.type = 'channel'
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND ch.user_id IS NULL
    ), target_latest AS (
      SELECT cd.*,
             (SELECT m.seq FROM messages AS m WHERE m.channel_id = cd.storage_id ORDER BY m.seq DESC LIMIT 1) AS latest_seq,
             CASE WHEN cd.plan = 'free'
                  THEN (SELECT MAX(m.created_at) FROM messages AS m WHERE m.channel_id = cd.storage_id) END AS latest_at
      FROM candidate AS cd
    )
    SELECT tl.server_id::text AS server_id, tl.id::text AS target_id, 'channel' AS kind, FALSE AS subscribed,
           0 AS unread_count, 0 AS mention_unread, 0 AS total_mentions,
           tl.latest_seq::text AS latest_seq, NULL AS latest_message_id,
           (uc.user_id IS NOT NULL) AS cursor_present,
           CAST(uc.last_read_seq AS BIGINT)::text AS last_read_seq,
           uc.read_state_version
    FROM target_latest AS tl
    LEFT JOIN user_channel_read_cursors AS uc ON uc.channel_id = tl.id AND uc.user_id = ${user}
    WHERE tl.latest_seq IS NOT NULL
      AND (tl.plan <> 'free' OR tl.latest_at > NOW() - INTERVAL '30 days')
      AND tl.latest_seq > COALESCE(CAST(uc.last_read_seq AS BIGINT), 0)
  `);
  return mapConversationUnreadRows((result as unknown as { rows: Record<string, unknown>[] }).rows, true);
}

/**
 * Production PostgreSQL sidebar unread source used when
 * `RAFT_INBOX_BACKEND=postgres` is enabled.
 */
export const postgresConversationUnreadSource: ConversationUnreadSource = {
  async summaryRows({ serverId, userId, includePublicNew }: ConversationUnreadSummaryQuery) {
    const rows = (await postgresConversationUnreadViewRows(userId, [serverId]))
      .filter((row) => row.unreadCount > 0 || row.totalMentions > 0);
    return includePublicNew ? [...rows, ...await postgresPublicHasNewRows(userId, serverId)] : rows;
  },
  async sidebarTotals({ serverIds, userId }: SidebarUnreadTotalsQuery) {
    const totals = new Map<string, number>();
    for (const row of await postgresConversationUnreadViewRows(userId, serverIds)) {
      if (!row.subscribed || row.kind === "thread" || row.kind === "task" || row.unreadCount <= 0) continue;
      totals.set(row.serverId, (totals.get(row.serverId) ?? 0) + row.unreadCount);
    }
    return [...totals].map(([serverId, unreadCount]) => ({ serverId, unreadCount }));
  },
};

/**
 * Derive an agent's offered inbox rows (`rw_agent_inbox_v7` semantics) directly
 * from PostgreSQL. Bounded to the agent's own subscriptions, follows, and mentions.
 */
export async function postgresAgentInboxChain(agentId: string): Promise<AgentInboxChainRow[]> {
  if (!UUID_RE.test(agentId)) return [];
  const normalizedAgentId = agentId.toLowerCase();
  const agentUuid = sql`${normalizedAgentId}::uuid`;
  const agentText = sql`${normalizedAgentId}::text`;
  const unreadPredicate = sql`m.seq > COALESCE(rc.last_read_seq, 0)
    AND NOT (m.sender_type = 'agent' AND m.sender_id = ${agentText})
    AND NOT COALESCE(m.message_type = 'system' AND m.causal_actor_type = 'agent' AND m.causal_actor_id = ${agentText}, FALSE)
    AND (m.system_subtype IS NULL OR m.system_subtype NOT IN ${NOISE_SUBTYPES})`;

  const result = await getDb().execute(sql`
    WITH proj AS (
      SELECT s.local_channel_id, s.server_id, j.canonical_channel_id
      FROM joint_channel_servers AS s
      JOIN joint_channels AS j ON j.id = s.joint_channel_id
      WHERE s.status = 'active' AND j.status = 'active'
    ), receiver_cursors AS (
      SELECT channel_id, COALESCE(last_read_seq8, CAST(last_read_seq AS BIGINT)) AS last_read_seq
      FROM agent_channel_read_cursors
      WHERE agent_id = ${agentUuid}
    ), subs AS (
      SELECT CASE WHEN c.type = 'dm' THEN 'dm' ELSE 'channel' END AS kind, c.id AS target_id, c.server_id
      FROM channel_agents AS ca
      JOIN channels AS c ON ca.channel_id = c.id AND c.type <> 'thread'
       AND c.deleted_at IS NULL AND c.archived_at IS NULL
      LEFT JOIN inbox_target_mute_states AS mu
        ON mu.receiver_type = 'agent' AND mu.receiver_id = ca.agent_id
       AND mu.source_channel_id = c.id AND mu.activity_muted
      WHERE ca.agent_id = ${agentUuid} AND mu.receiver_id IS NULL
      UNION ALL
      SELECT 'thread', c.id, c.server_id
      FROM thread_follows AS tf
      JOIN channels AS c ON tf.thread_channel_id = c.id
       AND c.deleted_at IS NULL AND c.archived_at IS NULL
      WHERE tf.follower_type = 'agent' AND tf.follower_id = ${agentUuid} AND tf.unfollowed_at IS NULL
    ), muted_subs AS (
      SELECT CASE WHEN c.type = 'dm' THEN 'dm' ELSE 'channel' END AS kind, c.id AS target_id, c.server_id,
             mu.mute_from_seq
      FROM channel_agents AS ca
      JOIN channels AS c ON ca.channel_id = c.id AND c.type <> 'thread'
       AND c.deleted_at IS NULL AND c.archived_at IS NULL
      JOIN inbox_target_mute_states AS mu
        ON mu.receiver_type = 'agent' AND mu.receiver_id = ca.agent_id
       AND mu.source_channel_id = c.id AND mu.activity_muted
      WHERE ca.agent_id = ${agentUuid}
    ), mention_storage AS (
      SELECT m.channel_id, m.message_seq, m.target_id, m.notifiable_at_send, m.notified_at,
             COALESCE(pj.canonical_channel_id, m.channel_id) AS storage_id
      FROM message_mentions AS m
      LEFT JOIN proj AS pj ON pj.local_channel_id = m.channel_id
      WHERE m.target_type = 'agent' AND m.target_id = ${agentUuid}
    ), mention_map AS (
      SELECT c.id AS storage_id, c.id AS target_id, FALSE AS projected
      FROM channels AS c
      WHERE c.id IN (SELECT storage_id FROM mention_storage)
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM proj AS p WHERE p.local_channel_id = c.id)
      UNION ALL
      SELECT p.canonical_channel_id, p.local_channel_id, TRUE
      FROM proj AS p
      JOIN channels AS lc ON lc.id = p.local_channel_id AND lc.deleted_at IS NULL AND lc.archived_at IS NULL
      WHERE p.canonical_channel_id IN (SELECT storage_id FROM mention_storage)
    ), cand AS (
      SELECT target_id FROM subs
      UNION
      SELECT target_id FROM muted_subs
      UNION
      SELECT target_id FROM mention_map
    ), target_meta AS (
      SELECT c.id AS target_id,
             COALESCE(sv.plan, 'free') AS plan,
             CASE WHEN p.local_channel_id IS NOT NULL THEN p.canonical_channel_id
                  WHEN c.deleted_at IS NULL AND c.archived_at IS NULL THEN c.id END AS storage_id
      FROM cand AS k
      JOIN channels AS c ON c.id = k.target_id
      LEFT JOIN proj AS p ON p.local_channel_id = c.id
      LEFT JOIN servers AS sv ON sv.id = c.server_id
    ), target_eligible AS (
      SELECT t.target_id, t.storage_id, lt.seq AS latest_seq
      FROM target_meta AS t
      LEFT JOIN LATERAL (
        SELECT m.seq
        FROM messages AS m
        WHERE m.channel_id = t.storage_id
        ORDER BY m.seq DESC
        LIMIT 1
      ) AS lt ON TRUE
      CROSS JOIN LATERAL (
        SELECT CASE WHEN t.plan = 'free'
                    THEN (SELECT MAX(m.created_at) FROM messages AS m WHERE m.channel_id = t.storage_id) END AS latest_at
      ) AS l
      WHERE lt.seq IS NULL
         OR t.plan <> 'free'
         OR l.latest_at > NOW() - INTERVAL '30 days'
    ), normal AS (
      SELECT s.kind, s.target_id, s.server_id,
             g.latest_seq,
             u_agg.unread_count,
             u_agg.first_unread_seq
      FROM subs AS s
      JOIN target_eligible AS g ON g.target_id = s.target_id
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = s.target_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS unread_count,
               MIN(m.seq) AS first_unread_seq
        FROM messages AS m
        WHERE m.channel_id = g.storage_id
          AND ${unreadPredicate}
      ) AS u_agg
    ), muted_prefix AS (
      SELECT s.kind, s.target_id, s.server_id,
             lt.seq AS latest_seq,
             u_agg.unread_count,
             u_agg.first_unread_seq
      FROM muted_subs AS s
      JOIN target_eligible AS g ON g.target_id = s.target_id
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = s.target_id
      JOIN LATERAL (
        SELECT m.seq
        FROM messages AS m
        WHERE m.channel_id = g.storage_id
          AND (s.mute_from_seq IS NULL OR m.seq < s.mute_from_seq)
        ORDER BY m.seq DESC
        LIMIT 1
      ) AS lt ON TRUE
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS unread_count,
               MIN(m.seq) AS first_unread_seq
        FROM messages AS m
        WHERE m.channel_id = g.storage_id
          AND (s.mute_from_seq IS NULL OR m.seq < s.mute_from_seq)
          AND ${unreadPredicate}
      ) AS u_agg
    ), thread_parent AS (
      SELECT c.id AS thread_channel_id, c.parent_message_id, m.channel_id AS parent_channel_id,
             pc.name AS parent_channel_name, pc.type AS parent_channel_type
      FROM channels AS c
      JOIN messages AS m ON m.id = c.parent_message_id
      JOIN channels AS pc ON pc.id = m.channel_id
      LEFT JOIN proj AS px ON px.local_channel_id = c.id
      WHERE c.type = 'thread' AND px.local_channel_id IS NULL AND c.id IN (SELECT target_id FROM cand)
      UNION ALL
      SELECT lt.id, ct.parent_message_id, COALESCE(pl.local_channel_id, m.channel_id),
             pc2.name, pc2.type
      FROM channels AS lt
      JOIN proj AS p ON p.local_channel_id = lt.id
      JOIN channels AS ct ON ct.id = p.canonical_channel_id
      JOIN messages AS m ON m.id = ct.parent_message_id
      LEFT JOIN proj AS pl ON pl.canonical_channel_id = m.channel_id AND pl.server_id = lt.server_id
      JOIN channels AS pc2 ON pc2.id = COALESCE(pl.local_channel_id, m.channel_id)
      WHERE lt.type = 'thread' AND lt.id IN (SELECT target_id FROM cand)
      UNION ALL
      SELECT tc.id, NULL::uuid, tc.parent_channel_id, tpc.name, tpc.type
      FROM channels AS tc
      JOIN channels AS tpc ON tpc.id = tc.parent_channel_id
      WHERE tc.type = 'task' AND tc.id IN (SELECT target_id FROM cand)
    ), mention_vis AS (
      SELECT map.storage_id, map.target_id, map.projected, c.type, c.server_id,
             EXISTS (SELECT 1 FROM channel_agents AS visa
                     WHERE visa.channel_id = map.target_id AND visa.agent_id = ${agentUuid}) AS member,
             (tp.parent_channel_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM channel_agents AS pvisa
               WHERE pvisa.channel_id = tp.parent_channel_id AND pvisa.agent_id = ${agentUuid})) AS parent_member,
             EXISTS (SELECT 1 FROM thread_follows AS mf
                     WHERE mf.thread_channel_id = map.target_id AND mf.follower_type = 'agent'
                       AND mf.follower_id = ${agentUuid} AND mf.unfollowed_at IS NULL) AS following
      FROM mention_map AS map
      JOIN target_eligible AS g ON g.target_id = map.target_id
      JOIN channels AS c ON c.id = map.target_id AND c.deleted_at IS NULL AND c.archived_at IS NULL
      LEFT JOIN thread_parent AS tp ON tp.thread_channel_id = map.target_id
    ), mention AS (
      SELECT CASE WHEN v.type IN ('thread', 'task') THEN 'thread' WHEN v.type = 'dm' THEN 'dm' ELSE 'channel' END AS kind,
             v.target_id, v.server_id,
             COUNT(*) FILTER (WHERE mm.message_seq > COALESCE(rc.last_read_seq, 0)
               AND (mm.notifiable_at_send OR mm.notified_at IS NOT NULL)) AS mention_unread,
             MAX(mm.message_seq) FILTER (WHERE mm.message_seq > COALESCE(rc.last_read_seq, 0)
               AND (mm.notifiable_at_send OR mm.notified_at IS NOT NULL)) AS max_mention_seq
      FROM mention_storage AS mm
      JOIN mention_vis AS v ON v.storage_id = mm.storage_id
      LEFT JOIN receiver_cursors AS rc ON rc.channel_id = v.target_id
      WHERE (v.type NOT IN ('thread', 'task') AND v.member)
         OR (v.type IN ('thread', 'task') AND (v.parent_member OR v.following))
         OR (mm.notified_at IS NOT NULL AND NOT v.projected)
      GROUP BY 1, 2, 3
    ), n AS (
      SELECT kind, target_id, server_id, unread_count, first_unread_seq, latest_seq FROM normal
      UNION ALL
      SELECT kind, target_id, server_id, unread_count, first_unread_seq, latest_seq FROM muted_prefix
    ), u AS (
      SELECT COALESCE(n.kind, mn.kind) AS kind,
             COALESCE(n.target_id, mn.target_id) AS target_id,
             COALESCE(n.server_id, mn.server_id) AS server_id,
             COALESCE(n.unread_count, 0) AS unread_count,
             n.first_unread_seq, n.latest_seq,
             COALESCE(mn.mention_unread, 0) AS mention_unread,
             mn.max_mention_seq,
             (n.target_id IS NOT NULL) AS subscribed
      FROM n
      FULL JOIN mention AS mn ON n.kind = mn.kind AND n.target_id = mn.target_id
      WHERE (n.target_id IS NOT NULL AND COALESCE(n.unread_count, 0) > 0)
         OR (COALESCE(mn.mention_unread, 0) > 0
             AND (n.target_id IS NULL OR mn.max_mention_seq > COALESCE(n.latest_seq, 0)))
    )
    SELECT CASE WHEN u.kind = 'thread' AND c.type = 'task' THEN 'task' ELSE u.kind END AS kind,
           u.target_id::text AS target_id,
           conv_task.task_number AS task_number, conv_task.title AS task_title,
           COALESCE(p.canonical_channel_id, u.target_id)::text AS storage_channel_id,
           u.server_id::text AS server_id,
           c.name AS channel_name, c.type AS channel_type,
           COALESCE(tp.parent_message_id, c.parent_message_id)::text AS parent_message_id,
           tp.parent_channel_id::text AS parent_channel_id, tp.parent_channel_name, tp.parent_channel_type,
           CAST(COALESCE(rc.last_read_seq, 0) AS BIGINT) AS last_read_seq,
           u.unread_count, u.first_unread_seq, u.latest_seq,
           u.mention_unread, u.max_mention_seq, u.subscribed,
           CASE WHEN u.subscribed
                THEN u.unread_count + CASE WHEN u.mention_unread > 0 AND u.max_mention_seq > COALESCE(u.latest_seq, 0) THEN 1 ELSE 0 END
                ELSE u.mention_unread END AS offered_unread,
           GREATEST(COALESCE(u.latest_seq, 0), COALESCE(u.max_mention_seq, 0)) AS activity_seq,
           CASE WHEN u.kind = 'thread' THEN tf.created_at ELSE ca.added_at END AS joined_at
    FROM u
    JOIN channels AS c ON c.id = u.target_id AND c.deleted_at IS NULL
    LEFT JOIN tasks AS conv_task ON c.type = 'task' AND conv_task.id = c.task_id
    LEFT JOIN proj AS p ON p.local_channel_id = u.target_id
    LEFT JOIN thread_parent AS tp ON tp.thread_channel_id = u.target_id AND u.kind = 'thread'
    LEFT JOIN channels AS pc ON pc.id = tp.parent_channel_id AND pc.deleted_at IS NULL
    LEFT JOIN channel_agents AS pca
      ON pca.channel_id = tp.parent_channel_id AND pca.agent_id = ${agentUuid}
    LEFT JOIN receiver_cursors AS rc ON rc.channel_id = u.target_id
    LEFT JOIN channel_agents AS ca
      ON ca.channel_id = u.target_id AND ca.agent_id = ${agentUuid} AND u.kind <> 'thread'
    LEFT JOIN thread_follows AS tf
      ON tf.thread_channel_id = u.target_id AND tf.follower_type = 'agent'
     AND tf.follower_id = ${agentUuid} AND tf.unfollowed_at IS NULL AND u.kind = 'thread'
    WHERE (CASE WHEN u.kind = 'thread' THEN tf.created_at ELSE ca.added_at END) IS NOT NULL
      AND (u.kind <> 'thread' OR (
            pc.id IS NOT NULL
            AND (pca.agent_id IS NOT NULL OR (pc.type = 'channel' AND pc.server_id = u.server_id))
          ))
  `);
  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows;
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return rows.map((row) => ({
    targetId: String(row.target_id),
    storageChannelId: String(row.storage_channel_id),
    kind: row.kind as AgentInboxChainRow["kind"],
    serverId: String(row.server_id),
    channelName: String(row.channel_name),
    channelType: row.channel_type as AgentInboxChainRow["channelType"],
    parentMessageId: row.parent_message_id == null ? null : String(row.parent_message_id),
    parentChannelId: row.parent_channel_id == null ? null : String(row.parent_channel_id),
    parentChannelName: row.parent_channel_name == null ? null : String(row.parent_channel_name),
    parentChannelType: row.parent_channel_type == null ? null : String(row.parent_channel_type),
    lastReadSeq: Number(row.last_read_seq),
    unreadCount: Number(row.unread_count),
    firstUnreadSeq: num(row.first_unread_seq),
    latestSeq: num(row.latest_seq),
    mentionUnread: Number(row.mention_unread),
    maxMentionSeq: num(row.max_mention_seq),
    subscribed: row.subscribed === true,
    offeredUnread: Number(row.offered_unread),
    activitySeq: Number(row.activity_seq),
    joinedAt: new Date(row.joined_at as string | Date),
    ...(row.kind === "task"
      ? { taskNumber: num(row.task_number), taskTitle: row.task_title == null ? null : String(row.task_title) }
      : {}),
  }));
}

/** Apply `readAgentInboxChainRows` filter/sort/limit options to derived PG rows. */
export function filterPostgresAgentInboxChainRows(
  rows: readonly AgentInboxChainRow[],
  opts: AgentInboxChainReadOptions = {},
): AgentInboxChainRow[] {
  let limit: number | undefined;
  if (opts.limit !== undefined) {
    limit = Math.trunc(opts.limit);
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new Error(`invalid agent inbox page limit: ${opts.limit}`);
    }
  }
  const targetSet = opts.targetIds ? new Set(opts.targetIds) : null;
  let filtered = rows.filter((row) => {
    if (opts.kind !== undefined && row.kind !== opts.kind) return false;
    if (opts.beforeSeq !== undefined && !(row.activitySeq < opts.beforeSeq)) return false;
    if (opts.mentionsOnly && !(row.mentionUnread > 0)) return false;
    if (targetSet !== null && !targetSet.has(row.targetId)) return false;
    return true;
  });
  if (limit !== undefined) {
    filtered = [...filtered].sort((a, b) => b.activitySeq - a.activitySeq).slice(0, limit);
  }
  return filtered;
}

/** Aggregate totals across derived PG agent inbox rows (`readAgentInboxChainTotals` semantics). */
export function computePostgresAgentInboxChainTotals(
  rows: readonly AgentInboxChainRow[],
): AgentInboxTotals & { messages: number } {
  let dms = 0;
  let mentions = 0;
  let messages = 0;
  for (const row of rows) {
    if (row.kind === "dm") dms += 1;
    if (row.mentionUnread > 0) mentions += 1;
    messages += row.offeredUnread;
  }
  return {
    conversations: rows.length,
    dms,
    mentions,
    messages,
  };
}

/**
 * Derive `/internal/agent-api/events?wait_for=` seq rows directly from PostgreSQL
 * (`rw_agent_inbox_v7` + `rw_target_latest_v4` semantics).
 */
export async function readPostgresAgentInboxChainTargetSeqs(
  agentId: string,
  targetIds: readonly string[],
): Promise<AgentInboxChainSeqRow[]> {
  if (targetIds.length === 0) return [];
  const wanted = new Set(targetIds);
  const chainRows = await postgresAgentInboxChain(agentId);
  const seqRows: AgentInboxChainSeqRow[] = [];
  const found = new Set<string>();
  for (const row of chainRows) {
    if (!wanted.has(row.targetId)) continue;
    found.add(row.targetId);
    seqRows.push({
      targetId: row.targetId,
      latestSeq: row.latestSeq,
      maxMentionSeq: row.maxMentionSeq,
      lastReadSeq: row.lastReadSeq,
      inAgentInbox: true,
      targetLatestSeq: null,
    });
  }
  const missing = [...wanted].filter((targetId) => !found.has(targetId));
  if (missing.length === 0) return seqRows;

  const missingUuids = missing.filter((id) => CANONICAL_UUID_RE.test(id));
  const targetLatest = new Map<string, number | null>();
  if (missingUuids.length > 0) {
    const channelList = sql.join(missingUuids.map((id) => sql`${id}::uuid`), sql`, `);
    const result = await getDb().execute(sql`
      WITH proj AS (
        SELECT s.local_channel_id, j.canonical_channel_id
        FROM joint_channel_servers AS s
        JOIN joint_channels AS j ON j.id = s.joint_channel_id
        WHERE s.status = 'active' AND j.status = 'active'
      ), target_storage AS (
        SELECT c.id::text AS target_id,
               COALESCE(p.canonical_channel_id, c.id) AS storage_id
        FROM ${channels} AS c
        LEFT JOIN proj AS p ON p.local_channel_id = c.id
        WHERE c.id IN (${channelList})
          AND (p.local_channel_id IS NOT NULL OR (c.deleted_at IS NULL AND c.archived_at IS NULL))
      )
      SELECT ts.target_id,
             (SELECT m.seq FROM messages AS m WHERE m.channel_id = ts.storage_id ORDER BY m.seq DESC LIMIT 1)::text AS latest_seq
      FROM target_storage AS ts
    `);
    for (const row of result.rows as Array<{ target_id: string; latest_seq: string | null }>) {
      targetLatest.set(String(row.target_id), row.latest_seq == null ? null : Number(row.latest_seq));
    }
  }
  return [
    ...seqRows,
    ...missing.map((targetId): AgentInboxChainSeqRow => ({
      targetId,
      latestSeq: null,
      maxMentionSeq: null,
      lastReadSeq: 0,
      inAgentInbox: false,
      targetLatestSeq: targetLatest.get(targetId) ?? null,
    })),
  ];
}
