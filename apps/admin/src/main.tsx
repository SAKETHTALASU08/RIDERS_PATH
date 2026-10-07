import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type ReviewItem = {
  id: string; documentType: string; byteSize: number; reviewStatus: string; reviewReason: string | null;
  uploadedAt: string; bookingId: string | null; studentRef: string; emailMasked: string; enrollmentMasked: string;
};
type ListingItem = {
  id: string; ownerRef: string; ownerEmailMasked: string; brand: string; model: string; year: number;
  bikeType: string; fuelType: string; transmission: string; hourlyRateInr: number; dailyRateInr: number;
  hubName: string; registrationMasked: string; status: string; adminNotes: string | null; submittedAt: string;
};
const apiBase = import.meta.env.VITE_ADMIN_API_URL || '/api';
const apiOrigin = new URL(apiBase, window.location.origin).origin;
let csrfToken = '';

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${apiBase}/admin/csrf-token`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not establish a secure admin session.');
  csrfToken = (await response.json()).csrfToken;
  return csrfToken;
}
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', await ensureCsrf());
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
  return body as T;
}

function AdminApp() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<'documents' | 'listings'>('documents');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');

  const refreshDocuments = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await call<ReviewItem[]>('/admin/documents?status=pending')); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to load document reviews.';
      if (message.includes('Authorization') || message.includes('UNAUTHORIZED') || message.includes('Session Expired')) setSignedIn(false);
      setError(message);
    } finally { setLoading(false); }
  }, []);
  const refreshListings = useCallback(async () => {
    setLoading(true); setError('');
    try { setListings(await call<ListingItem[]>('/admin/listings')); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to load listing reviews.';
      if (message.includes('Authorization') || message.includes('UNAUTHORIZED') || message.includes('Session Expired')) setSignedIn(false);
      setError(message);
    } finally { setLoading(false); }
  }, []);
  const refresh = tab === 'documents' ? refreshDocuments : refreshListings;
  useEffect(() => { if (signedIn) void refresh(); }, [signedIn, tab, refresh]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try { await call('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }); setPassword(''); setSignedIn(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed.'); }
    finally { setLoading(false); }
  };
  const openDocument = async (id: string) => {
    setBusyId(id); setError('');
    try {
      const result = await call<{ url: string; expiresInSeconds: number }>(`/admin/documents/${encodeURIComponent(id)}/view-url`);
      setPreview({ id, url: new URL(result.url, apiOrigin).toString() });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the document.'); }
    finally { setBusyId(''); }
  };
  const reviewDocument = async (item: ReviewItem, status: 'approved' | 'rejected') => {
    const reason = reasons[item.id] || '';
    if (status === 'rejected' && reason.trim().length < 3) { setError('Add a short reason before rejecting a document.'); return; }
    setBusyId(item.id); setError('');
    try {
      await call(`/admin/documents/${encodeURIComponent(item.id)}/review`, { method: 'POST', body: JSON.stringify({ status, reason }) });
      setPreview((current) => current?.id === item.id ? null : current);
      await refreshDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this review.'); }
    finally { setBusyId(''); }
  };
  const reviewListing = async (listing: ListingItem, decision: 'approved' | 'changes_requested' | 'rejected') => {
    const notes = reasons[listing.id] || '';
    if (decision !== 'approved' && notes.trim().length < 3) { setError('Add review notes before requesting changes or rejecting a listing.'); return; }
    setBusyId(listing.id); setError('');
    try {
      await call(`/admin/listings/${encodeURIComponent(listing.id)}/review`, { method: 'POST', body: JSON.stringify({ decision, notes }) });
      await refreshListings();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this listing review.'); }
    finally { setBusyId(''); }
  };

  if (!signedIn) return <main className="shell auth"><form onSubmit={signIn} className="panel"><p className="eyebrow">PRIVATE REVIEW WORKSPACE</p><h1>Admin sign in</h1><p className="muted">Use your admin credentials. The session stays in an HttpOnly cookie.</p><label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p role="alert" aria-live="polite" className="error">{error}</p>}<button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></form></main>;

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">RIDERS PATH · ADMIN</p><h1>{tab === 'documents' ? 'Document review queue' : 'Bike listing review'}</h1><p className="muted">{tab === 'documents' ? 'Review identity documents manually. Automated image analysis does not approve or reject uploads.' : 'Review owner submissions and leave actionable notes for requested changes.'}</p></div><button className="secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh queue'}</button></header>
    <nav className="tabs" aria-label="Admin review sections"><button className={tab === 'documents' ? 'active' : 'secondary'} aria-current={tab === 'documents' ? 'page' : undefined} onClick={() => setTab('documents')}>Student documents</button><button className={tab === 'listings' ? 'active' : 'secondary'} aria-current={tab === 'listings' ? 'page' : undefined} onClick={() => setTab('listings')}>Bike listings</button></nav>
    {error && <p role="alert" aria-live="polite" className="error banner">{error}</p>}
    {tab === 'documents' && (loading && items.length === 0 ? <section className="panel" role="status">Loading the review queue…</section> : items.length === 0 ? <section className="panel empty"><h2>No pending documents</h2><p className="muted">New uploads will appear here when students submit booking requests.</p></section> : <div className="layout"><section className="queue" aria-label="Pending document reviews">{items.map((item) => <article className={`panel item ${preview?.id === item.id ? 'selected' : ''}`} key={item.id}><div className="item-heading"><div><p className="eyebrow">{item.documentType.replaceAll('_', ' ')}</p><h2>{item.studentRef}</h2></div><span className="status">Pending</span></div><dl><div><dt>Email</dt><dd>{item.emailMasked}</dd></div><div><dt>Enrollment</dt><dd>{item.enrollmentMasked}</dd></div><div><dt>Booking</dt><dd>{item.bookingId || 'Not submitted'}</dd></div><div><dt>Uploaded</dt><dd>{new Date(item.uploadedAt).toLocaleString()}</dd></div><div><dt>File size</dt><dd>{(item.byteSize / 1024).toFixed(0)} KB</dd></div></dl><button className="secondary" disabled={busyId === item.id} onClick={() => void openDocument(item.id)}>{busyId === item.id ? 'Preparing secure link…' : 'Open private image'}</button>{preview?.id === item.id && <p className="muted small">Secure link expires after 60 seconds. Issuing this link is recorded in the audit log.</p>}<label>Review reason<textarea rows={2} value={reasons[item.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Required if rejecting" /></label><div className="actions"><button disabled={busyId === item.id} onClick={() => void reviewDocument(item, 'approved')}>Approve</button><button className="danger" disabled={busyId === item.id} onClick={() => void reviewDocument(item, 'rejected')}>Reject</button></div></article>)}</section>{preview && <aside className="panel viewer"><div className="viewer-head"><h2>Private image preview</h2><button className="secondary" onClick={() => setPreview(null)}>Close</button></div><img src={preview.url} alt="Student document submitted for manual review" width="900" height="700" referrerPolicy="no-referrer"/><p className="muted small">Use the review controls on the matching queue item. Link issuance is audited.</p></aside>}</div>)}
    {tab === 'listings' && (loading && listings.length === 0 ? <section className="panel" role="status">Loading listing reviews…</section> : listings.length === 0 ? <section className="panel empty"><h2>No listings waiting for review</h2><p className="muted">New owner submissions will appear here.</p></section> : <section className="queue" aria-label="Pending bike listings">{listings.map((listing) => <article className="panel item" key={listing.id}><div className="item-heading"><div><p className="eyebrow">{listing.ownerRef}</p><h2>{listing.brand} {listing.model}</h2></div><span className="status">{listing.status.replaceAll('_', ' ')}</span></div><dl><div><dt>Owner email</dt><dd>{listing.ownerEmailMasked}</dd></div><div><dt>Registration</dt><dd>{listing.registrationMasked}</dd></div><div><dt>Vehicle</dt><dd>{listing.year} · {listing.bikeType} · {listing.fuelType} · {listing.transmission}</dd></div><div><dt>Pickup hub</dt><dd>{listing.hubName}</dd></div><div><dt>Rates</dt><dd>₹{listing.hourlyRateInr}/hr · ₹{listing.dailyRateInr}/day cap</dd></div><div><dt>Submitted</dt><dd>{new Date(listing.submittedAt).toLocaleString()}</dd></div></dl><label>Admin notes<textarea rows={3} value={reasons[listing.id] ?? listing.adminNotes ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [listing.id]: event.target.value }))} placeholder="Required for changes requested or rejection" /></label><div className="actions"><button disabled={busyId === listing.id} onClick={() => void reviewListing(listing, 'approved')}>Approve</button><button className="secondary" disabled={busyId === listing.id} onClick={() => void reviewListing(listing, 'changes_requested')}>Request changes</button><button className="danger" disabled={busyId === listing.id} onClick={() => void reviewListing(listing, 'rejected')}>Reject</button></div></article>)}</section>)}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminApp /></React.StrictMode>);
