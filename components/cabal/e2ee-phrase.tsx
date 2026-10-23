"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePhrase, phraseProblem } from "@/lib/e2ee/crypto";
import { friendlyError } from "@/lib/errors";
import { useE2ee } from "./e2ee-provider";
import { useCabal } from "./store";

export const phraseKey = (userId: string) => ["e2ee-phrase", userId] as const;

/** Whether an unlock phrase is set. Undefined while checking. */
export function usePhrase() {
  const { session } = useE2ee();
  return useSWR(phraseKey(session.userId), () => session.hasPhrase(), {
    revalidateOnFocus: true,
  });
}

// The account email sits in a hidden field so password managers save the
// phrase as a Cabal login and offer it on your other devices.
export function AccountField() {
  const { email } = useCabal();
  return (
    <input
      type="email"
      name="username"
      autoComplete="username"
      value={email}
      readOnly
      hidden
    />
  );
}

export function PhraseInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "new-password" | "current-password";
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name="password"
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={shown ? "Hide phrase" : "Show phrase"}
        aria-pressed={shown}
      >
        {shown ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

/** Choose (or change) the phrase, on a device that's already unlocked. */
export function SetPhraseForm({
  onDone,
  onCancel,
  cancelLabel = "Cancel",
  submitLabel = "Save phrase",
}: {
  onDone: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
}) {
  const { session } = useE2ee();
  const { mutate } = useSWRConfig();
  const [phrase, setPhrase] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const weak = phraseProblem(phrase);
    if (weak) return setProblem(weak);
    if (normalizePhrase(phrase) !== normalizePhrase(again))
      return setProblem("The two phrases don’t match.");
    setBusy(true);
    setProblem(null);
    try {
      await session.setPhrase(phrase);
      await mutate(phraseKey(session.userId), true, { revalidate: false });
      toast.success(
        "Unlock phrase saved. Type it on any device to read your direct messages.",
      );
      onDone();
    } catch (err) {
      setProblem(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <AccountField />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-phrase">Unlock phrase</Label>
        <PhraseInput
          id="new-phrase"
          value={phrase}
          onChange={setPhrase}
          autoComplete="new-password"
          invalid={!!problem}
          describedBy="new-phrase-hint"
          autoFocus
        />
        <p
          id="new-phrase-hint"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          Three or four unrelated words you’ll remember. Not a password you use
          anywhere else. Your password manager can save it for your other
          devices.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-phrase-again">Type it again</Label>
        <PhraseInput
          id="new-phrase-again"
          value={again}
          onChange={setAgain}
          autoComplete="new-password"
          invalid={!!problem}
          describedBy={problem ? "new-phrase-problem" : undefined}
        />
      </div>
      {problem && (
        <p
          id="new-phrase-problem"
          className="text-xs text-destructive"
          role="alert"
        >
          {problem}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={busy || !phrase || !again}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
