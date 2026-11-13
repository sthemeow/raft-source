import { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import { UserPlus } from "lucide-react";
import { Button, Input, SegmentedControl, SegmentedControlItem, SegmentedControlLabel } from "@botiverse/raft-ui";
import { validateEmailAddress } from "@botiverse/raft-shared";
import api from "../../api/client";
import { useServerStore } from "../../store/serverStore";
import DialogCard from "../../components/ui/DialogCard";
import { DialogCardFooter, DialogCommit } from "../../components/ui/NarrowDialog";
import Banner from "../../components/ui/Banner";
import FormField from "../../components/ui/FormField";

/**
 * Create an account for someone who has none, and put them in this server.
 *
 * This is the in-product way to add a person when registration is off — §3 of
 * the Raft License wants accounts created by an administrator (#Raft-Dev:a5519ad5).
 * The person chooses their own password from the emailed link; the administrator
 * never sees or sets one.
 */
export default function CreateMemberAccountDialog({ onClose }: { onClose: () => void }) {
  const { formatMessage } = useIntl();
  const server = useServerStore((s) => s.current);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; name?: string }>({});
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const nextFieldErrors: { email?: string; name?: string } = {};
    const emailError = validateEmailAddress(email);
    if (emailError) nextFieldErrors.email = formatMessage({ id: "member.createAccount.invalidEmail" });
    if (!name.trim()) nextFieldErrors.name = formatMessage({ id: "member.createAccount.nameRequired" });
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    if (!server) return;
    setSending(true);
    try {
      await api.post(`/servers/${server.id}/members/create`, { email: email.trim(), name: name.trim(), role });
      setCreatedEmail(email.trim());
    } catch (err: any) {
      const status = err?.response?.status;
      const serverError = err?.response?.data?.error;
      if (status === 409) {
        setError(formatMessage({ id: "member.createAccount.exists" }));
      } else if (status === 403) {
        setError(formatMessage({ id: "member.createAccount.refused" }));
      } else {
        setError(serverError || formatMessage({ id: "member.createAccount.failed" }));
      }
    } finally {
      setSending(false);
    }
  }, [email, name, role, server, formatMessage]);

  if (!server) return null;

  if (createdEmail) {
    return (
      <DialogCard
        title={formatMessage({ id: "member.createAccount.createdTitle" })}
        onClose={onClose}
        maxWidthClass="max-w-lg"
        narrow="sheet"
      >
        <p className="text-sans-body text-foreground">
          {formatMessage({ id: "member.createAccount.createdBody" }, { email: createdEmail })}
        </p>
        <DialogCardFooter>
          <DialogCommit>
            {() => (
              <Button size="lg" variant="primary" type="button" onClick={onClose}>
                {formatMessage({ id: "common.close" })}
              </Button>
            )}
          </DialogCommit>
        </DialogCardFooter>
      </DialogCard>
    );
  }

  return (
    <DialogCard
      title={formatMessage({ id: "member.createAccount.title" })}
      description={formatMessage({ id: "member.createAccount.description" })}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      narrow="sheet"
    >
      <form onSubmit={handleSubmit} className="stack-y-4 md:pointer-fine:stack-y-3">
        {error ? <Banner intent="warning">{error}</Banner> : null}
        <FormField label={formatMessage({ id: "member.createAccount.email" })} error={fieldErrors.email}>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            autoComplete="off"
            data-testid="create-account-email"
            required
          />
        </FormField>
        <FormField label={formatMessage({ id: "member.createAccount.name" })} error={fieldErrors.name}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
            }}
            autoComplete="off"
            data-testid="create-account-name"
            required
          />
        </FormField>
        <FormField label={formatMessage({ id: "member.createAccount.role" })}>
          <SegmentedControl
            value={role}
            onValueChange={(next) => setRole(next as "member" | "admin")}
            aria-label={formatMessage({ id: "member.createAccount.role" })}
            data-testid="create-account-role"
          >
            <SegmentedControlItem value="member">
              <SegmentedControlLabel>{formatMessage({ id: "member.createAccount.roleMember" })}</SegmentedControlLabel>
            </SegmentedControlItem>
            <SegmentedControlItem value="admin">
              <SegmentedControlLabel>{formatMessage({ id: "member.createAccount.roleAdmin" })}</SegmentedControlLabel>
            </SegmentedControlItem>
          </SegmentedControl>
        </FormField>
        <DialogCardFooter>
          <Button size="lg" variant="ghost" type="button" onClick={onClose}>
            {formatMessage({ id: "common.confirm.cancel" })}
          </Button>
          <DialogCommit>
            {(inHead: boolean) => (
              <Button size={inHead ? "md" : "lg"} variant="primary" type="submit" disabled={sending}>
                <UserPlus size={18} aria-hidden="true" />
                {sending
                  ? formatMessage({ id: "member.createAccount.creating" })
                  : formatMessage({ id: "member.createAccount.submit" })}
              </Button>
            )}
          </DialogCommit>
        </DialogCardFooter>
      </form>
    </DialogCard>
  );
}
