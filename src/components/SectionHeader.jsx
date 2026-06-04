/**
 * Spidey – SectionHeader Component
 */

export default function SectionHeader({ tag, title, description }) {
  return (
    <div className="section-header">
      {tag && <span className="section-header__tag">{tag}</span>}
      <h2 className="section-header__title font-display">{title}</h2>
      {description && <p className="section-header__desc">{description}</p>}
    </div>
  );
}
