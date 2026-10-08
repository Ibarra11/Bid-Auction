import { useEffect, useState } from 'react';

import {
  type AuctionItem,
  type DemoUser,
  fetchAuction,
  fetchAuctions,
  fetchUsers,
  formatCurrency,
  formatTimeLeft,
} from './catalog';
import { ProductArt } from './components/ProductArt';
import { ProductCard } from './components/ProductCard';
import { SiteHeader } from './components/SiteHeader';
import { activeUserStorageKey, UserSwitcher } from './components/UserSwitcher';

function Status({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className="page-status" role={error ? 'alert' : 'status'}>
      <p>{message}</p>
      {error && <button onClick={() => window.location.reload()}>Try again</button>}
    </div>
  );
}

function useAuctionList(query = '', category = '') {
  const [items, setItems] = useState<AuctionItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setItems(null);
    setError('');
    void fetchAuctions(query, category)
      .then(setItems)
      .catch(() => setError('Could not load auctions.'));
  }, [query, category]);

  return { items, error };
}

function HomePage() {
  const { items, error } = useAuctionList();
  return (
    <>
      <section className="hero container">
        <div>
          <p className="eyebrow">Compute deserves a second life</p>
          <h1>
            Serious hardware.
            <br />
            Less serious prices.
          </h1>
          <p>Bid on tested server equipment from data centers and operators across the country.</p>
          <a className="hero-action" href="/search">
            Browse all auctions <span>→</span>
          </a>
        </div>
        <div className="hero-rack" aria-hidden="true">
          <span className="rack-light one" />
          <span className="rack-light two" />
          <span className="rack-light three" />
          <div className="rack-unit">
            <b>GPU–08</b>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="rack-unit">
            <b>CORE–96</b>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="rack-unit">
            <b>MEM–1.5T</b>
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <section className="catalog-section container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ending soon</p>
            <h2>Equipment worth watching</h2>
          </div>
          <a href="/search">
            View all auctions <span>→</span>
          </a>
        </div>
        {error ? (
          <Status message={error} error />
        ) : items ? (
          <div className="product-grid">
            {items.map((item) => (
              <ProductCard key={item.slug} item={item} />
            ))}
          </div>
        ) : (
          <Status message="Loading auctions…" />
        )}
      </section>
    </>
  );
}

function SearchPage({ query, category }: { query: string; category: string }) {
  const { items, error } = useAuctionList(query, category);
  const heading = query ? `Results for “${query}”` : category || 'All auctions';

  return (
    <main className="search-page container">
      <div className="breadcrumbs">
        <a href="/">Home</a>
        <span>/</span>
        <span>Search</span>
      </div>
      <div className="search-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1>{heading}</h1>
          <p>
            {items
              ? `${items.length} ${items.length === 1 ? 'auction' : 'auctions'}`
              : 'Searching…'}
          </p>
        </div>
        <select aria-label="Sort auctions" value="ending" disabled>
          <option value="ending">Ending soonest</option>
        </select>
      </div>
      {error ? (
        <Status message={error} error />
      ) : !items ? (
        <Status message="Searching auctions…" />
      ) : items.length ? (
        <div className="product-grid search-results">
          {items.map((item) => (
            <ProductCard key={item.slug} item={item} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No equipment found</h2>
          <p>Try a broader search or a different category.</p>
          <a href="/search">View all auctions</a>
        </div>
      )}
    </main>
  );
}

function ItemPage({ slug }: { slug: string }) {
  const [item, setItem] = useState<AuctionItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    void fetchAuction(slug)
      .then((auction) => {
        setItem(auction);
        document.title = `${auction.title} · Auction House`;
      })
      .catch(() => setError('Auction not found or unavailable.'));
  }, [slug]);

  if (error) return <Status message={error} error />;
  if (!item) return <Status message="Loading auction…" />;
  const timeLeft = formatTimeLeft(item.endsAt);

  return (
    <main className="item-page container">
      <div className="breadcrumbs">
        <a href="/">Home</a>
        <span>/</span>
        <a href={`/search?category=${encodeURIComponent(item.category)}`}>{item.category}</a>
        <span>/</span>
        <span>{item.title}</span>
      </div>
      <div className="item-layout">
        <div className="item-gallery">
          <ProductArt kind={item.art} label={`Illustration of ${item.title}`} />
          <div className="thumbnail-row">
            <button className="selected">
              <ProductArt kind={item.art} label="Main view" />
            </button>
            <button>
              <span>+</span>
              <small>More photos soon</small>
            </button>
          </div>
        </div>
        <section className="item-summary">
          <p className="product-category">
            {item.category} · {item.condition}
          </p>
          <h1>{item.title}</h1>
          <p className="item-kicker">{item.kicker}</p>
          <div className="auction-panel">
            <div className="current-price">
              <span>Starting price</span>
              <strong>{formatCurrency(item.currentPriceCents)}</strong>
              <small>{item.bidCount} bids</small>
            </div>
            <div className="bidder">
              <span>Current bidder</span>
              <strong>No bids yet</strong>
            </div>
            <div className="ending">
              <span>Time left</span>
              <strong>{timeLeft}</strong>
            </div>
          </div>
          <div className="seller-card">
            <span className="seller-avatar">{item.seller.displayName.charAt(0)}</span>
            <div>
              <small>Sold by</small>
              <strong>{item.seller.displayName}</strong>
              <span>
                @{item.seller.handle} · {item.location}
              </span>
            </div>
          </div>
        </section>
      </div>
      <div className="item-details-grid">
        <section>
          <p className="eyebrow">About this item</p>
          <h2>The details</h2>
          <p>{item.description}</p>
        </section>
        <section className="spec-list">
          <p className="eyebrow">Specifications</p>
          {item.specs.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

export function App() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [userError, setUserError] = useState('');

  useEffect(() => {
    void fetchUsers()
      .then((loadedUsers) => {
        setUsers(loadedUsers);
        const storedId = Number(sessionStorage.getItem(activeUserStorageKey));
        const storedUser = loadedUsers.find((user) => user.id === storedId);
        const selected = storedUser ?? loadedUsers[Math.floor(Math.random() * loadedUsers.length)];
        if (selected) {
          setActiveUserId(selected.id);
          sessionStorage.setItem(activeUserStorageKey, String(selected.id));
        }
      })
      .catch(() => setUserError('Users unavailable'));
  }, []);

  function switchUser(userId: number) {
    setActiveUserId(userId);
    sessionStorage.setItem(activeUserStorageKey, String(userId));
  }

  const activeUser = users.find((user) => user.id === activeUserId) ?? null;
  useEffect(() => {
    document.title = 'Auction House';
  }, [path]);
  let page = <HomePage />;
  if (path === '/search') page = <SearchPage query={query} category={category} />;
  if (path.startsWith('/items/'))
    page = <ItemPage slug={decodeURIComponent(path.slice('/items/'.length))} />;

  return (
    <div className="app-shell">
      <SiteHeader initialQuery={query} initialCategory={category} activeUser={activeUser} />
      {page}
      <footer>
        <div className="container">
          <span>Auction House</span>
          <span className="footer-note">Database-backed marketplace</span>
          <UserSwitcher
            users={users}
            activeUserId={activeUserId}
            error={userError}
            onChange={switchUser}
          />
        </div>
      </footer>
    </div>
  );
}
