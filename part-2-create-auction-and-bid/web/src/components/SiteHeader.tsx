import { type FormEvent, useState } from 'react';
import { categories, type DemoUser } from '../catalog';

export function SiteHeader({
  initialQuery,
  initialCategory,
  activeUser,
}: {
  initialQuery: string;
  initialCategory: string;
  activeUser: DemoUser | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (category) params.set('category', category);
    window.location.assign(`/search${params.size ? `?${params.toString()}` : ''}`);
  }

  const initial = activeUser?.displayName.charAt(0) ?? '…';
  return (
    <header className="site-header">
      <div className="container header-main">
        <a className="brand" href="/" aria-label="Auction House home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Auction House</span>
        </a>
        <form className="search-form" role="search" onSubmit={search}>
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            aria-label="Search auctions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search GPUs, memory, chassis, CPUs…"
          />
          <select
            aria-label="Search category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All equipment</option>
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button type="submit">Search</button>
        </form>
        <a
          className="sign-in"
          href="#demo-user"
          aria-label={
            activeUser ? `Active user: ${activeUser.displayName}` : 'Choosing active user'
          }
        >
          <span className="avatar">{initial}</span>
          <span>{activeUser?.displayName ?? 'Choosing user…'}</span>
        </a>
      </div>
      <nav className="container category-nav" aria-label="Equipment categories">
        <a href="/search">Featured</a>
        {categories.map((option) => (
          <a key={option} href={`/search?category=${encodeURIComponent(option)}`}>
            {option}
          </a>
        ))}
      </nav>
    </header>
  );
}
