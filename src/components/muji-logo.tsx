import "./muji-logo.css";

/**
 * The MUJI brand mark: white wordmark in the signature red plate. Scales with
 * the parent's font-size (the plate is sized in em), so the same component
 * serves the across-the-room display header and the compact staff bar.
 */
export function MujiLogo() {
  return (
    <span className="muji-logo" role="img" aria-label="MUJI">
      <span className="muji-logo__en" aria-hidden="true">
        MUJI
      </span>
      <span className="muji-logo__jp" aria-hidden="true">
        無印良品
      </span>
    </span>
  );
}
