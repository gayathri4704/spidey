/**
 * Spidey – Allies Page
 * Shows ally cards and a "join" form (stored in IndexedDB — no backend)
 */

import { useState } from 'react';
import SectionHeader from '../components/SectionHeader';
import { addRecord, STORES } from '../db/database';

const ALLIES = [
  {
    emoji: '🦅',
    name: 'The Falcon',
    role: 'Air Support',
    desc: 'Tactical aerial reconnaissance and rapid extraction when the web runs out.',
    color: 'blue',
  },
  {
    emoji: '🐱',
    name: 'Black Cat',
    role: 'Stealth Ops',
    desc: 'Unmatched agility and charm — a complicated alliance that always gets results.',
    color: 'red',
  },
  {
    emoji: '🤖',
    name: 'Iron Spider',
    role: 'Tech Division',
    desc: 'Stark-enhanced armour providing unrivalled firepower and intelligence support.',
    color: 'blue',
  },
  {
    emoji: '🌊',
    name: 'Aquanaut',
    role: 'Marine Ops',
    desc: 'Covers the harbour and waterways, ensuring no villain escapes by sea.',
    color: 'red',
  },
];

export default function AlliesPage() {
  const [form, setForm] = useState({ name: '', codename: '', skill: '' });
  const [status, setStatus] = useState('idle'); // idle | saving | success | error

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.codename.trim()) return;

    setStatus('saving');
    try {
      await addRecord(STORES.ALLIES, { ...form });
      setStatus('success');
      setForm({ name: '', codename: '', skill: '' });
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <section id="allies" className="section web-pattern" aria-labelledby="allies-heading">
      <div className="container">
        <SectionHeader
          tag="🤝 Network"
          title="ALLIED FORCES"
          description="No hero fights alone. These trusted allies form an elite network ready to swing into action at a moment's notice."
        />

        {/* Ally cards */}
        <div
          id="allies-heading"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-lg)',
            marginBottom: 'var(--space-3xl)',
          }}
        >
          {ALLIES.map(({ emoji, name, role, desc, color }) => (
            <article
              key={name}
              className="card"
              style={{ textAlign: 'center' }}
              aria-label={`Ally: ${name}`}
            >
              <div
                style={{
                  fontSize: '3rem',
                  marginBottom: 'var(--space-md)',
                  filter: `drop-shadow(0 0 12px var(--spidey-${color}))`,
                  display: 'block',
                }}
                role="img"
                aria-hidden="true"
              >
                {emoji}
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.2rem',
                  marginBottom: 'var(--space-xs)',
                  color: 'var(--text-primary)',
                }}
              >
                {name}
              </h3>
              <span className={`badge badge-${color}`} style={{ marginBottom: 'var(--space-md)' }}>
                {role}
              </span>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: 'var(--space-md)' }}>
                {desc}
              </p>
            </article>
          ))}
        </div>

        {/* Join form */}
        <div
          style={{
            maxWidth: '560px',
            marginInline: 'auto',
            padding: 'var(--space-xl)',
            background: 'var(--gradient-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              letterSpacing: '0.04em',
              textAlign: 'center',
              marginBottom: 'var(--space-sm)',
            }}
          >
            JOIN THE <span className="text-gradient-red">FORCE</span>
          </h2>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              marginBottom: 'var(--space-xl)',
            }}
          >
            Register as an ally. All data stays in your browser — no server required.
          </p>

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {/* Name */}
            <div>
              <label
                htmlFor="ally-name"
                style={{ display: 'block', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}
              >
                Real Name
              </label>
              <input
                id="ally-name"
                name="name"
                type="text"
                placeholder="e.g. Peter Parker"
                value={form.name}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '12px var(--space-md)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color var(--transition-fast)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--spidey-red)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
              />
            </div>

            {/* Codename */}
            <div>
              <label
                htmlFor="ally-codename"
                style={{ display: 'block', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}
              >
                Hero Codename
              </label>
              <input
                id="ally-codename"
                name="codename"
                type="text"
                placeholder="e.g. Web-Crawler"
                value={form.codename}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '12px var(--space-md)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color var(--transition-fast)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--spidey-red)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
              />
            </div>

            {/* Skill */}
            <div>
              <label
                htmlFor="ally-skill"
                style={{ display: 'block', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}
              >
                Primary Skill
              </label>
              <select
                id="ally-skill"
                name="skill"
                value={form.skill}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '12px var(--space-md)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: form.skill ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'border-color var(--transition-fast)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--spidey-blue-light)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
              >
                <option value="" disabled>Select your specialty…</option>
                <option value="combat">Hand-to-Hand Combat</option>
                <option value="tech">Technology & Hacking</option>
                <option value="stealth">Stealth & Infiltration</option>
                <option value="intel">Intelligence & Strategy</option>
                <option value="aerial">Aerial Operations</option>
                <option value="other">Other</option>
              </select>
            </div>

            <button
              id="ally-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={status === 'saving'}
              style={{ marginTop: 'var(--space-sm)', width: '100%', justifyContent: 'center' }}
            >
              {status === 'saving' ? '⏳ Registering…' : '🕷️ &nbsp;Join the Force'}
            </button>

            {status === 'success' && (
              <p
                role="status"
                style={{ textAlign: 'center', color: '#4ade80', fontSize: '0.9rem', fontFamily: 'var(--font-heading)' }}
              >
                ✅ Welcome, ally! Your record has been saved locally.
              </p>
            )}
            {status === 'error' && (
              <p
                role="alert"
                style={{ textAlign: 'center', color: 'var(--spidey-red-light)', fontSize: '0.9rem', fontFamily: 'var(--font-heading)' }}
              >
                ❌ Something went wrong. Please try again.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
