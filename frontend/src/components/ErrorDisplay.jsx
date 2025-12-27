export default function ErrorDisplay({ errors, warnings, onDismiss }) {
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto mb-4 space-y-3">
      {errors.length > 0 && (
        <div className="p-4 bg-[#8B0000]/15 border border-[#C41E3A]/40 rounded-xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C41E3A] to-[#8B0000] flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-[#FF6B6B] font-semibold">
                Recognition Issues Detected
              </h4>
              <p className="text-sm text-[#CC5555] mt-1">
                Some areas could not be fully recognized. The results below may be
                incomplete.
              </p>
              <ul className="mt-3 space-y-1.5">
                {errors.map((error, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#E57373]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C41E3A]" />
                    {error}
                  </li>
                ))}
              </ul>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-[#C41E3A]/60 hover:text-[#FF6B6B] transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-4 bg-[#DAA520]/10 border border-[#DAA520]/30 rounded-xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFD700] to-[#DAA520] flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg
                className="w-4 h-4 text-[#1a1a2e]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-[#DAA520] font-semibold">Warnings</h4>
              <ul className="mt-2 space-y-1.5">
                {warnings.map((warning, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#B8860B]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#DAA520]" />
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
