import { load } from 'cheerio';

import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const PRIVATE_HOST = /^(localhost$|.*\.local$|.*\.internal$|.*\.svc$|.*\.zeabur\.internal$|127\.|10\.|192\.168\.|169\.254\.|0\.)/i;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;
const CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

export const route: Route = {
    path: '/scrape/:url64',
    example: '/custom/scrape/aHR0cHM6Ly9leGFtcGxlLm9yZy9ibG9n?item=article&title=h2%20a&link=h2%20a',
    parameters: {
        url64: 'base64url-encoded target listing page URL, absolute http(s), public hosts only',
        item: 'CSS selector matching every entry element on the page',
        title: 'Optional CSS selector relative to item for the title, defaults to the item text',
        link: 'Optional CSS selector relative to item for the link, defaults to a[href]',
        date: 'Optional CSS selector relative to item for the publish date',
        desc: 'Optional CSS selector relative to item for the description HTML, defaults to the whole item HTML',
        author: 'Optional CSS selector relative to item for the author',
        limit: 'Optional maximum number of items, default 50',
        feed_title: 'Optional feed title, defaults to the page title',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Generic CSS Selector Scraper',
    maintainers: ['hi-unc1e'],
    handler,
};

async function handler(ctx) {
    const q = ctx.req.query();
    let target;
    try {
        target = Buffer.from(ctx.req.param('url64'), 'base64url').toString('utf8');
    } catch {
        throw new Error('invalid base64url encoding of the target URL');
    }
    if (!target || !/^https?:\/\//i.test(target)) {
        throw new Error('decoded target must be an absolute http(s) URL');
    }
    const { hostname } = new URL(target);
    if (PRIVATE_HOST.test(hostname) || PRIVATE_172.test(hostname) || CGNAT.test(hostname)) {
        throw new Error('private / internal addresses are not allowed');
    }
    if (!q.item) {
        throw new Error('provide ?item=<css selector> matching every entry element');
    }
    const limit = Math.min(Number(q.limit) || 50, 200);

    const { data: html } = await got(target);
    const $ = load(html);

    const entries = [];
    const elements = $(q.item).toArray().slice(0, limit);

    for (const el of elements) {
        const $item = $(el);
        const title = (q.title ? $item.find(q.title).first() : $item).text().trim();
        const href = $item.find(q.link || 'a[href]').first().attr('href');
        if (!title || !href) {
            continue;
        }
        const link = new URL(href, target).href;
        const dateEl = q.date ? $item.find(q.date).first() : null;
        const pubDate = dateEl && dateEl.length ? parseDate(dateEl.attr('datetime') || dateEl.text().trim()) : null;
        const description = q.desc ? $item.find(q.desc).first().html() || '' : $item.html() || '';
        const author = q.author ? $item.find(q.author).first().text().trim() : '';

        entries.push({
            title,
            link,
            pubDate: pubDate || undefined,
            description,
            author: author || undefined,
        });
    }

    return {
        title: q.feed_title || $('title').first().text().trim() || target,
        link: target,
        description: 'Scraped by RSSHub /custom/scrape',
        allowEmpty: true,
        item: entries,
    };
}
