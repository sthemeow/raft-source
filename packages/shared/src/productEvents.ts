// Product event registry (RFC-067 §3.2).
//
// Every product event and its allowed properties is declared here, once, for
// every client and for server ingest. Clients get their typed `track()` API
// from it; ingest rejects (and counts) anything validateProductEvent refuses.
//
// Product events are designed on purpose. Add, rename or remove one only with
// the event-registry owner's sign-off, never as a side effect of feature work:
// each entry states the question it answers and who asked. Properties are
// low-cardinality ids/enums/counts only — never message text or other user
// content. Names starting with `$` are reserved for fields the pipeline adds.
//
// PRODUCT_EVENT_REGISTRY is plain JSON-shaped data on purpose: native clients
// (RFC-067 §6) will generate their APIs from a JSON export of it.

// NOT A SETTLED RULE — pending RFC-067 §9.4 (legal review of regional
// defaults). What "Share usage data" means for a user who has not chosen; the
// server gate and the settings UI both read it.
export const SHARE_USAGE_DATA_DEFAULT = false;

export const PRODUCT_EVENT_SOURCES = ["server", "web", "desktop", "android", "ios", "harmonyos"] as const;
export type ProductEventSource = (typeof PRODUCT_EVENT_SOURCES)[number];

export type ProductEventPropertySpec = (
  | { readonly type: "enum"; readonly values: readonly string[] }
  | { readonly type: "boolean" }
  | { readonly type: "integer" }
  /**
   * Only for short tokens such as a campaign source; never free text. Values
   * must match PRODUCT_EVENT_STRING_TOKEN, so an email, phone number or
   * sentence cannot get through.
   */
  | { readonly type: "string"; readonly maxLength: number }
  /**
   * A bare host name such as a referring site (`x.com`): lowercase labels
   * joined by dots, no scheme, path, query, port or IP address.
   */
  | { readonly type: "hostname" }) & { readonly required?: true };

export const PRODUCT_EVENT_STRING_TOKEN = /^[a-z0-9_-]*$/;
export const PRODUCT_EVENT_HOSTNAME = /^(?=.{1,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const IPV4_ADDRESS = /^\d+(?:\.\d+){3}$/;

export interface ProductEventSpec {
  /** The question this event answers. "It might be useful" is not one. */
  readonly question: string;
  /** Who asked for it (and reads the answer). */
  readonly requestedBy: string;
  readonly sources: readonly ProductEventSource[];
  readonly properties: Readonly<Record<string, ProductEventPropertySpec>>;
}

const WEB_CLIENTS = ["web", "desktop"] as const;

const PWA_INSTALL_PROPERTIES = {
  platform: { type: "enum", values: ["ios_safari", "ios_other", "android_chromium", "desktop_chromium", "other"] },
  surface: { type: "enum", values: ["notification_center", "ios_instruction_sheet", "settings"] },
  trigger: { type: "enum", values: ["supported_browser", "settings"] },
  display_mode: { type: "enum", values: ["browser", "standalone", "fullscreen", "minimal-ui", "unknown"] },
  session_count_bucket: { type: "enum", values: ["1", "2", "3-5", "6+"] },
  cooldown_state: { type: "enum", values: ["not_dismissed", "dismissed_active", "expired"] },
  outcome: { type: "enum", values: ["accepted", "dismissed"] },
} as const;

const PWA_INSTALL_QUESTION =
  "Does the add-to-home-screen prompt get mobile web users to install the app, and where do they drop off (per platform and surface)?";

export const PAGE_VIEW_ROUTES = [
  "channel", "dm", "activity", "tasks", "saved", "search", "members", "members_graph",
  "agent", "human", "computer", "computers", "settings", "release_notes",
] as const;

/** Settings tab ids (web `SETTINGS_TABS`; a web test keeps the two in sync). */
export const SETTINGS_PAGE_TABS = [
  "account", "language-region", "appearance", "notifications", "server", "billing", "administration",
  "im-bridges", "integrations", "labs", "mcp", "providers", "about", "feedback",
] as const;

export const AGENT_CREATE_ENTRIES = ["sidebar", "sidebar_external", "channel_members", "computer_detail"] as const;

// Bulk "Change model" on the Computer page (flag bulk_change_model_web_v0).
// Contract agreed with John in #raft-botiverse-user-analytics (2026-10-14).
// One random operation_id per dialog open links the four events. Apply is a
// series of ordinary agent updates, so agent PATCH counts are not usage.
// The four *_count results on bulk_model_change_finished are per agent and
// mutually exclusive; they add up to change_count + restart_only_count.
// "Succeeded" means the update / restart request completed, not that the agent
// is now running well.
const BULK_MODEL_CHANGE_QUESTION =
  "Do people use bulk Change model, and does it finish? (Decides whether to widen the bulk_change_model_web_v0 trial.)";
const BULK_MODEL_CHANGE_REVIEW = "cindyz; contract reviewed with John (2026-10-14)";
const BULK_MODEL_CHANGE_OPERATION = { type: "string", maxLength: 36 } as const;

// Public Server visit counts. Written by the server from
// POST /api/public-visits/:slug (never from a client batch), so anonymous
// visitors count too. Named `public_page_*`: what happens ON the public page,
// not "a public channel" (cindyz, 2026-10-15; renamed before any prod data).
// An in-app event about a channel says which kind it is with `channel_scope`
// (public_page / members / private), never with a channel id. Design reviewed in #proj-analytics (Tenny, 2026-10-14):
// rows carry no IP, cookie or visitor id; analytics_id only for a signed-in
// visitor who shares usage data. `visitor` is decided by the server.
//
// Where visits come from (cindyz, 2026-10-14): only on the view that opened
// the tab (`entry: landing`) — the referring site (the server keeps only the
// registrable domain, publicVisitCounts.referrerSite) and the utm_source /
// utm_medium / utm_campaign of the landing link. Never the full referring URL.
// Which channel was opened: the public channel's id.
//
// Visitor id (cindyz / Tenny, 2026-10-14; flag public_visitor_id_v0): a
// logged-out visitor who accepts the page's cookie banner sends a random id.
// It is personal data and never goes into these rows: the server writes it to
// product.public_visitors (395-day retention) under the visit's uuid.
const PUBLIC_SERVER_VISIT_QUESTION =
  "After a server goes public, how often is its public page visited, where do visits come from, and which channels are opened, by anonymous vs signed-in visitors? (Counts, not people.)";
const PUBLIC_SERVER_VISIT_REVIEW = "cindyz; contract reviewed with John, endpoint with Tenny (2026-10-14)";
export const PUBLIC_SERVER_VISITORS = ["anonymous", "signed_in_non_member", "signed_in_member"] as const;
export const PUBLIC_SERVER_VISIT_ENTRIES = ["landing", "in_app"] as const;
/**
 * How long a public-page visitor id lives (cindyz, 2026-10-14: 13 months): the
 * browser's consent choice and id expire after it, and product.public_visitors
 * is created with the same DATA RETENTION.
 */
export const PUBLIC_VISITOR_ID_MAX_AGE_DAYS = 395;
/**
 * How a public page treats the visitor id, decided by the server from the
 * visitor's country (cindyz, 2026-10-15): `ask` where the law requires consent
 * first (or the country is unknown), `default_on` elsewhere, with an opt-out
 * in Cookie settings, and `default_off` there instead when the browser sends
 * Global Privacy Control (Tenny): no id unless the visitor opts in.
 */
export const PUBLIC_VISITOR_ID_MODES = ["ask", "default_on", "default_off"] as const;
export type PublicVisitorIdMode = (typeof PUBLIC_VISITOR_ID_MODES)[number];
const CAMPAIGN_TOKEN = { type: "string", maxLength: 64 } as const;

// First journey batch, reviewed with Vivian / meichen in
// #raft-botiverse-user-analytics (2026-10-05). Outcomes (an agent exists) stay
// database facts; these record only the path.
const JOURNEY_REVIEW = "nova; reviewed by Vivian/meichen (2026-10-05)";

// Primary navigation entries (xxchan, 2026-10-17,
// #raft-botiverse-user-analytics:01aa9a67): which entry people use to reach
// each main surface, per platform, to decide what the mobile tab bar holds.
// One event per click on an entry (not per route change: page_viewed counts
// those); `was_active` marks a tap on the surface the user is already on,
// usually "back to the top". No ids, paths or text. Compare entries with this
// event only; activity_open stays for stdrc's Activity question. Native apps
// send it too, with the same values (agreed with Lagoon, #proj-mobile:5a02b7a8):
// `surface` names the kind of entry, while `source` and `$device_type` tell
// the platform, so a native tablet's side bar is `rail` like the web's.
export const NAV_DESTINATIONS = ["home", "activity", "search", "saved", "tasks", "members", "usage", "computers", "settings"] as const;
/**
 * mobile_home_shortcuts: the Search / Activity / Saved rows at the top of the
 * phone's Home. sidebar: the desktop channel sidebar (Saved). keyboard_shortcut: ⌘K / Ctrl+K.
 */
export const NAV_SURFACES = ["mobile_tab_bar", "rail", "top_bar", "mobile_home_shortcuts", "sidebar", "keyboard_shortcut"] as const;
const NAV_ENTRY_SOURCES = ["web", "desktop", "ios", "android", "harmonyos"] as const;

export const PRODUCT_EVENT_REGISTRY = {
  page_viewed: {
    question: "Which parts of the Raft app do people use, and how often? (In-app navigation only; not raft.build / docs site visits.)",
    requestedBy: JOURNEY_REVIEW,
    sources: WEB_CLIENTS,
    properties: {
      route: { type: "enum", values: PAGE_VIEW_ROUTES },
      settings_tab: { type: "enum", values: SETTINGS_PAGE_TABS },
    },
  },
  agent_create_opened: {
    question: "From which entry points, outside the onboarding wizard, do people start creating an agent?",
    requestedBy: JOURNEY_REVIEW,
    sources: WEB_CLIENTS,
    properties: { entry: { type: "enum", values: AGENT_CREATE_ENTRIES } },
  },
  // Group by announcement/version across contexts. A dismissal is not proof of reading.
  // announcement_id identifies operator-created content, never a person.
  announcement_shown: {
    question: "Did recipients see each announcement version? (Decides whether to re-deliver.)",
    requestedBy: "cindyz; explicit action classification requested 2026-10-15; reviewed with John and Nova",
    sources: WEB_CLIENTS,
    properties: { announcement_id: { type: "string", maxLength: 36, required: true }, delivery_version: { type: "integer", required: true } },
  },
  announcement_interacted: {
    question: "Which announcement control did recipients use? (Distinguishes CTA conversion from dismissal.)",
    requestedBy: "cindyz; explicit action classification requested 2026-10-15; reviewed with John and Nova",
    sources: WEB_CLIENTS,
    properties: { announcement_id: { type: "string", maxLength: 36, required: true }, delivery_version: { type: "integer", required: true }, action: { type: "enum", values: ["primary", "secondary", "close", "outside", "escape"], required: true }, has_cta: { type: "boolean", required: true } },
  },
  bulk_model_change_opened: {
    question: BULK_MODEL_CHANGE_QUESTION,
    requestedBy: BULK_MODEL_CHANGE_REVIEW,
    sources: WEB_CLIENTS,
    properties: {
      operation_id: BULK_MODEL_CHANGE_OPERATION,
      entry: { type: "enum", values: ["machine_panel", "partial_receipt"] },
      agent_count: { type: "integer" },
    },
  },
  bulk_model_change_closed: {
    question: BULK_MODEL_CHANGE_QUESTION,
    requestedBy: BULK_MODEL_CHANGE_REVIEW,
    sources: WEB_CLIENTS,
    properties: {
      operation_id: BULK_MODEL_CHANGE_OPERATION,
      step: { type: "enum", values: ["choose", "review"] },
    },
  },
  bulk_model_change_submitted: {
    question: BULK_MODEL_CHANGE_QUESTION,
    requestedBy: BULK_MODEL_CHANGE_REVIEW,
    sources: WEB_CLIENTS,
    properties: {
      operation_id: BULK_MODEL_CHANGE_OPERATION,
      change_count: { type: "integer" },
      restart_only_count: { type: "integer" },
      skip_count: { type: "integer" },
    },
  },
  bulk_model_change_finished: {
    question: BULK_MODEL_CHANGE_QUESTION,
    requestedBy: BULK_MODEL_CHANGE_REVIEW,
    sources: WEB_CLIENTS,
    properties: {
      operation_id: BULK_MODEL_CHANGE_OPERATION,
      outcome: { type: "enum", values: ["all_succeeded", "partial", "none_succeeded"] },
      succeeded_count: { type: "integer" },
      restart_pending_count: { type: "integer" },
      save_failed_count: { type: "integer" },
      unconfirmed_count: { type: "integer" },
      duration_ms: { type: "integer" },
    },
  },
  public_page_viewed: {
    question: PUBLIC_SERVER_VISIT_QUESTION,
    requestedBy: PUBLIC_SERVER_VISIT_REVIEW,
    sources: ["server"],
    properties: {
      visitor: { type: "enum", values: PUBLIC_SERVER_VISITORS },
      entry: { type: "enum", values: PUBLIC_SERVER_VISIT_ENTRIES },
      referrer_domain: { type: "hostname" },
      utm_source: CAMPAIGN_TOKEN,
      utm_medium: CAMPAIGN_TOKEN,
      utm_campaign: CAMPAIGN_TOKEN,
    },
  },
  public_page_channel_opened: {
    question: PUBLIC_SERVER_VISIT_QUESTION,
    requestedBy: PUBLIC_SERVER_VISIT_REVIEW,
    sources: ["server"],
    properties: {
      visitor: { type: "enum", values: PUBLIC_SERVER_VISITORS },
      channel_id: { type: "string", maxLength: 36 },
    },
  },
  // Same beacon, flag and cap as the two above. `channel_id` is the public
  // channel the thread hangs off, `thread_channel_id` the thread itself: both
  // are ids of public content, checked by the server before they are kept.
  public_page_thread_opened: {
    question: "Which threads on a public page do visitors open, and in which channels? (Counts, not people.)",
    requestedBy: "cindyz (2026-10-15, via Tenny); endpoint reviewed with Tenny",
    sources: ["server"],
    properties: {
      visitor: { type: "enum", values: PUBLIC_SERVER_VISITORS },
      channel_id: { type: "string", maxLength: 36 },
      thread_channel_id: { type: "string", maxLength: 36 },
    },
  },
  // Written by POST /api/public/servers/:slug/join-as-guest after a join, for
  // a joiner who shares usage data (publicVisitCounts.recordPublicServerJoin).
  // With cookie consent, product.public_visitors keeps the page's visitor id
  // under the same uuid for 395 days: the visit -> join link (cindyz / Tenny,
  // 2026-10-14). `has_visitor_id` says whether that visitor row was written
  // (never the id itself), so a reconciliation can tell "no consent" from "row
  // lost" (AndyLok / Tenny).
  public_page_server_joined: {
    question: "How many public-page visitors go on to join the server they visited?",
    requestedBy: "cindyz; design reviewed with Tenny (2026-10-14)",
    sources: ["server"],
    properties: { has_visitor_id: { type: "boolean" } },
  },
  nav_entry_selected: {
    question: "Which primary navigation entries do people use to reach each main surface, and how often, per platform? (Decides the mobile tab bar.)",
    requestedBy: "xxchan (2026-10-17)",
    sources: NAV_ENTRY_SOURCES,
    properties: {
      destination: { type: "enum", values: NAV_DESTINATIONS, required: true },
      surface: { type: "enum", values: NAV_SURFACES, required: true },
      was_active: { type: "boolean", required: true },
      /** Web only: browser tab vs installed PWA. */
      display_mode: PWA_INSTALL_PROPERTIES.display_mode,
    },
  },
  activity_open: {
    question: "How often do people open Activity, and from which entry point?",
    requestedBy: "stdrc",
    sources: WEB_CLIENTS,
    properties: { from: { type: "enum", values: ["rail", "sidebar"] } },
  },
  activity_item_open: {
    question: "Which kinds of Activity items do people open?",
    requestedBy: "stdrc",
    sources: WEB_CLIENTS,
    properties: { item_kind: { type: "enum", values: ["channel", "dm", "thread", "mention_action"] } },
  },
  activity_mark: {
    question: "Do people triage Activity items (mark read / done)?",
    requestedBy: "stdrc",
    sources: WEB_CLIENTS,
    properties: { action: { type: "enum", values: ["read", "done"] } },
  },
  community_cn_qr_page_view: {
    question: "How many people reach the Chinese community QR page, and from which campaign source?",
    requestedBy: "iynewz",
    sources: WEB_CLIENTS,
    properties: { from: { type: "string", maxLength: 64 } },
  },
  pwa_install_eligible: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
  pwa_install_cta_shown: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
  pwa_install_cta_clicked: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
  pwa_install_native_prompt_result: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
  pwa_install_ios_instruction_dismissed: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
  pwa_install_appinstalled: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
  pwa_install_standalone_detected: { question: PWA_INSTALL_QUESTION, requestedBy: "stdrc", sources: WEB_CLIENTS, properties: PWA_INSTALL_PROPERTIES },
} as const satisfies Record<string, ProductEventSpec>;

type Registry = typeof PRODUCT_EVENT_REGISTRY;

export type ProductEventName = keyof Registry;

type PropertyValue<S> =
  S extends { type: "enum"; values: readonly (infer V)[] } ? V
    : S extends { type: "boolean" } ? boolean
      : S extends { type: "integer" } ? number
        : string;

type PropertiesFromSpec<P extends Readonly<Record<string, ProductEventPropertySpec>>> = {
  -readonly [K in keyof P as P[K] extends { required: true } ? K : never]-?: PropertyValue<P[K]>;
} & {
  -readonly [K in keyof P as P[K] extends { required: true } ? never : K]?: PropertyValue<P[K]>;
};
export type ProductEventProperties<E extends ProductEventName> = PropertiesFromSpec<Registry[E]["properties"]>;

export type ProductEventRejection =
  | "unregistered_event"
  | "source_not_allowed"
  | "unknown_property"
  | "invalid_property_value"
  | "missing_property";

export type ProductEventValidation =
  | { ok: true; event: ProductEventName }
  | { ok: false; reason: ProductEventRejection; property?: string };

export function isProductEventName(name: string): name is ProductEventName {
  return Object.prototype.hasOwnProperty.call(PRODUCT_EVENT_REGISTRY, name);
}

function isValidPropertyValue(spec: ProductEventPropertySpec, value: unknown): boolean {
  switch (spec.type) {
    case "enum":
      return typeof value === "string" && spec.values.includes(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isSafeInteger(value);
    case "string":
      return typeof value === "string" && value.length <= spec.maxLength && PRODUCT_EVENT_STRING_TOKEN.test(value);
    case "hostname":
      return typeof value === "string" && PRODUCT_EVENT_HOSTNAME.test(value) && !IPV4_ADDRESS.test(value);
  }
}

/**
 * The host name of a referring URL, as the `hostname` type stores it
 * (lowercase, without a leading `www.`), or null when there is none to keep:
 * empty, not http(s), an IP address or anything else the type refuses.
 */
export function referrerHostname(referrer: string): string | null {
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return PRODUCT_EVENT_HOSTNAME.test(host) && !IPV4_ADDRESS.test(host) ? host : null;
}

/**
 * A campaign parameter (utm_*) as a `string` token, or null when it is not
 * one. Values are lowercased but never rewritten otherwise, so an email or a
 * sentence is dropped rather than squeezed into a token.
 */
export function campaignToken(value: string | null | undefined, maxLength = 64): string | null {
  const token = (value ?? "").trim().toLowerCase();
  return token !== "" && token.length <= maxLength && PRODUCT_EVENT_STRING_TOKEN.test(token) ? token : null;
}

/**
 * Checks an incoming event against the registry. Missing properties are allowed
 * unless explicitly required; unknown ones and values outside the declared type are not.
 */
export function validateProductEvent(
  name: string,
  properties: Readonly<Record<string, unknown>>,
  source: ProductEventSource,
): ProductEventValidation {
  if (!isProductEventName(name)) return { ok: false, reason: "unregistered_event" };
  const spec: ProductEventSpec = PRODUCT_EVENT_REGISTRY[name];
  if (!spec.sources.includes(source)) return { ok: false, reason: "source_not_allowed" };
  for (const [property, propertySpec] of Object.entries(spec.properties)) {
    if (propertySpec.required && (!Object.prototype.hasOwnProperty.call(properties, property) || properties[property] === undefined)) {
      return { ok: false, reason: "missing_property", property };
    }
  }
  for (const [property, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    const propertySpec = Object.prototype.hasOwnProperty.call(spec.properties, property)
      ? spec.properties[property]
      : undefined;
    if (!propertySpec) return { ok: false, reason: "unknown_property", property };
    if (!isValidPropertyValue(propertySpec, value)) {
      return { ok: false, reason: "invalid_property_value", property };
    }
  }
  return { ok: true, event: name };
}
