export interface Article {
    title: string;
    description: string;
    url: string;
    image: string;
    source: string;
    publishedAt: string;
}

export interface NewsResponse {
    articles: Article[];
    status: string;
    totalResults: number;
}


