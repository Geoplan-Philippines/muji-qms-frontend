import "./muji-logo.css";

/**
 * The MUJI brand mark. Renders the logo image sized in em, so the same
 * component serves the across-the-room display header and the compact staff
 * bar; its footprint scales with the parent's font-size.
 */
export function MujiLogo() {
  return (
    <img
      className="muji-logo"
      src="/src/assets/muji_logo.png"
      alt="MUJI"
      width={1024}
      height={1024}
      decoding="async"
    />
  );
}
