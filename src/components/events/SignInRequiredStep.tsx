'use client';

interface SignInRequiredStepProps {
  firstName?: string;
  onContinueAsGuest?: () => void;
  showGuestOption: boolean;
  callbackUrl?: string;
}

export default function SignInRequiredStep({
  firstName,
  onContinueAsGuest,
  showGuestOption,
  callbackUrl,
}: SignInRequiredStepProps) {
  const signinUrl = callbackUrl
    ? `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/auth/signin';

  return (
    <div className="space-y-5 text-center">
      {firstName && (
        <p className="text-lg font-semibold text-gray-900">
          Welcome back, {firstName}!
        </p>
      )}
      <p className="text-sm text-gray-600">
        We found a member account associated with this email.
        Please sign in to register as a member and access your full profile.
      </p>

      <a
        href={signinUrl}
        className="block w-full py-3 rounded-xl font-semibold text-white bg-[var(--btn-color)] hover:bg-[var(--btn-hover)] transition-colors text-center"
      >
        Sign In
      </a>

      {showGuestOption && onContinueAsGuest && (
        <div className="pt-1">
          <p className="text-xs text-gray-400 mb-2">
            Prefer not to sign in?
          </p>
          <button
            onClick={onContinueAsGuest}
            className="text-sm text-gray-500 underline hover:text-gray-700 transition-colors"
          >
            Continue as guest instead
          </button>
        </div>
      )}
    </div>
  );
}
