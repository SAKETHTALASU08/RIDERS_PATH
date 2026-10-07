import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ROUTE_METADATA, SITE_NAME, SITE_URL } from '../../config/site.config';
import { apiClient } from '../../api/client';

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

export const PageMetadata: React.FC<{ title?: string; description?: string; noIndex?: boolean }> = ({
  title,
  description,
  noIndex = false,
}) => {
  const { pathname } = useLocation();
  const [bikeMetadata, setBikeMetadata] = useState<{ title: string; description: string } | null>(null);
  const normalizedPath = pathname.startsWith('/bikes/') ? '/bikes'
    : pathname.startsWith('/book/') ? '/book'
      : ROUTE_METADATA[pathname] ? pathname : '/404';
  const metadata = ROUTE_METADATA[normalizedPath];
  const effectiveNoIndex = noIndex || normalizedPath === '/404' || normalizedPath === '/book';
  useEffect(() => {
    if (!pathname.startsWith('/bikes/')) { setBikeMetadata(null); return; }
    let active = true;
    const bikeId = decodeURIComponent(pathname.slice('/bikes/'.length));
    apiClient.getBikeById(bikeId).then((bike) => {
      if (active) setBikeMetadata({
        title: `${bike.brand} ${bike.model} | Riders Path`,
        description: `View the ${bike.year} ${bike.brand} ${bike.model}, pickup hub, hourly and daily rates, and live availability.`,
      });
    }).catch(() => { if (active) setBikeMetadata(null); });
    return () => { active = false; };
  }, [pathname]);
  const pageTitle = title || bikeMetadata?.title || metadata.title;
  const pageDescription = description || bikeMetadata?.description || metadata.description;

  useEffect(() => {
    document.title = pageTitle;
    const canonical = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.append(link);
    }
    link.href = canonical;
    setMeta('meta[name="description"]', 'name', 'description', pageDescription);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:title"]', 'property', 'og:title', pageTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', pageDescription);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', pageTitle);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', pageDescription);
    setMeta('meta[name="robots"]', 'name', 'robots', effectiveNoIndex ? 'noindex, nofollow' : 'index, follow');
  }, [effectiveNoIndex, pageDescription, pageTitle, pathname]);

  return null;
};
