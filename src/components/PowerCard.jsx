/**
 * Spidey – PowerCard Component
 */

export default function PowerCard({ icon, title, description, delay = 0 }) {
  return (
    <article
      className={`power-card animate-fade-in-up delay-${delay}`}
      aria-label={title}
    >
      <span className="power-card__icon" role="img" aria-hidden="true">
        {icon}
      </span>
      <h3 className="power-card__title">{title}</h3>
      <p className="power-card__desc">{description}</p>
    </article>
  );
}
