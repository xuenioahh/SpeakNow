export default function CharacterFigure({
  avatarUrl = "",
  fallback = "U",
  size = "large",
  accent = "amber",
  label = "",
  subtitle = "",
  mirror = false,
}) {
  const isLarge = size === "large";
  const toneClass = accent === "cyan"
    ? "character-figure-cyan"
    : accent === "violet"
      ? "character-figure-violet"
      : "character-figure-amber";

  return (
    <div className={`character-figure-wrap ${mirror ? "character-figure-mirror" : ""}`}>
      <div className={`character-figure-shell ${isLarge ? "character-figure-shell-lg" : "character-figure-shell-sm"}`}>
        <div className={`character-figure-head ${toneClass}`}>
          <div className="character-figure-hair" />
          {isLarge ? <div className="character-figure-brow character-figure-brow-left" /> : null}
          {isLarge ? <div className="character-figure-brow character-figure-brow-right" /> : null}
          <div className="character-figure-face">
            {avatarUrl ? (
              <img src={avatarUrl} alt={label || "Character"} className="h-full w-full object-cover" />
            ) : (
              <div className="character-figure-features">
                <div className="character-figure-eyes">
                  <span className="character-figure-eye" />
                  <span className="character-figure-eye" />
                </div>
                <div className="character-figure-cheeks">
                  <span className="character-figure-cheek" />
                  <span className="character-figure-cheek" />
                </div>
                <div className="character-figure-mouth" />
                <span className={`${isLarge ? "character-figure-fallback-lg" : "character-figure-fallback-sm"} font-bold text-slate-700/28`}>
                  {String(fallback || "U").slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className={`character-figure-body ${toneClass}`} />
        {isLarge ? (
          <>
            <div className="character-figure-arm character-figure-arm-left" />
            <div className="character-figure-arm character-figure-arm-right" />
          </>
        ) : null}
        <div className="character-figure-shadow" />
      </div>
      {(label || subtitle) && (
        <div className="mt-4 text-center">
          {label ? <p className="text-lg font-semibold text-foreground">{label}</p> : null}
          {subtitle ? <p className="text-xs text-foreground/68">{subtitle}</p> : null}
        </div>
      )}
    </div>
  );
}
