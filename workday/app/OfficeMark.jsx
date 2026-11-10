// Pixel-art office facades identify the employer cards without external assets.
export function OfficeMark({ company }) {
  const seed = Array.from(company).reduce((n, c) => n + c.codePointAt(0), 0);
  return (
    <span className={"facade tone-" + (seed % 4)} aria-hidden="true">
      <i className="facade-block left" />
      <i className="facade-block tower" />
      <i className="facade-block wing" />
    </span>
  );
}
