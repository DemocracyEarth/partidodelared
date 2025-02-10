import { Article, NewsResponse } from "./types";
import Parser from 'rss-parser';

const ARGENTINE_NEWS_FEEDS = [
    {
        url: 'https://www.clarin.com/rss/lo-ultimo/',
        name: 'Clarín'
    },
    {
        url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml',
        name: 'La Nación'
    },
    {
        url: 'https://www.pagina12.com.ar/rss/portada',
        name: 'Página 12'
    }
];

export const createNewsClient = () => {
    const parser = new Parser();

    const getNews = async (): Promise<NewsResponse> => {
        try {
            const articles: Article[] = [];

            for (const feed of ARGENTINE_NEWS_FEEDS) {
                try {
                    const feedData = await parser.parseURL(feed.url);

                    const feedArticles = feedData.items.map(item => ({
                        title: item.title || '',
                        description: item.contentSnippet || item.content || '',
                        url: item.link || '',
                        image: item.enclosure?.url || '',
                        source: feed.name,
                        publishedAt: item.pubDate || new Date().toISOString()
                    }));

                    articles.push(...feedArticles);
                } catch (error) {
                    console.error(`Error fetching ${feed.name} RSS feed:`, error);
                    // Continue with other feeds even if one fails
                    continue;
                }
            }

            // Sort articles by date, most recent first
            articles.sort((a, b) =>
                new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            );

            return {
                articles,
                status: 'ok',
                totalResults: articles.length
            };
        } catch (error: any) {
            console.error("Error fetching news", error.message);
            throw error;
        }
    };

    return { getNews };
};
