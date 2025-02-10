import {
    elizaLogger,
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { getArgentinaNews } from "../examples";
import { createNewsClient } from "../services";

interface MessageResponse {
    messageId: number;
    responses: Array<{
        text: string;
        userId: number;
    }>;
}

interface SentimentResult {
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
}

interface NewsAnalysis {
    newsId: string;
    title: string;
    responses: MessageResponse[];
    overallSentiment?: SentimentResult;
}

export const getArgentinaNewsAction: Action = {
    name: "ARGENTINA_NEWS",
    similes: ["ARGENTINA_NEWS", "ARGENTINA_HEADLINES", "ARGENTINA_HEADLINE"],
    description: "Obtiene las noticias de Argentina desde los principales diarios y las publica en Telegram para recolectar opiniones",
    validate: async (runtime: IAgentRuntime) => {
        // Validate Telegram settings
        const telegramGroupId = runtime.getSetting("TELEGRAM_GROUP_ID");
        if (!telegramGroupId) {
            throw new Error("TELEGRAM_GROUP_ID not set in settings");
        }
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback: HandlerCallback
    ) => {
        const newsClient = createNewsClient();
        const telegramClient = runtime.clients?.telegram;
        const twitterClient = runtime.clients?.twitter;

        if (!telegramClient) {
            throw new Error("Telegram client not initialized");
        }

        if (!twitterClient) {
            throw new Error("Twitter client not initialized");
        }

        const telegramGroupId = runtime.getSetting("TELEGRAM_GROUP_ID");
        if (!telegramGroupId) {
            throw new Error("TELEGRAM_GROUP_ID not set in settings");
        }

        try {
            const newsData = await newsClient.getNews();
            elizaLogger.success("News fetched successfully");

            // Get the top 3 news articles
            const topNews = newsData.articles.slice(0, 3);
            const newsAnalysis: NewsAnalysis[] = [];

            // Post each news article to Telegram and ask for opinions
            for (const article of topNews) {
                const summary = await generateNeutralSummary(article.title, article.description);
                const message = `📰 *Nueva Noticia de ${article.source}*\n\n${summary}\n\n🔗 ${article.url}\n\n💭 ¿Qué opinan sobre esta noticia? ¿Están de acuerdo o en desacuerdo con la situación presentada? ¡Compartan sus pensamientos!`;

                const sentMessage = await telegramClient.bot.telegram.sendMessage(
                    telegramGroupId,
                    message,
                    { parse_mode: "Markdown" }
                );

                newsAnalysis.push({
                    newsId: article.url,
                    title: article.title,
                    responses: [{
                        messageId: sentMessage.message_id,
                        responses: []
                    }]
                });

                // Wait a bit between messages to avoid flooding
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Schedule sentiment analysis and Twitter posting after 2 hours
            setTimeout(async () => {
                for (const newsItem of newsAnalysis) {
                    try {
                        // Collect responses for each news item
                        const responses = await collectTelegramResponses(telegramClient, telegramGroupId, newsItem.responses[0].messageId);
                        newsItem.responses[0].responses = responses;

                        // Analyze sentiment of responses
                        const sentiment = await analyzeSentiment(responses.map(r => r.text));
                        newsItem.overallSentiment = sentiment;

                        // If there's a clear consensus, post to Twitter
                        if (sentiment.confidence > 0.7) {
                            const tweet = await generateTweet(newsItem.title, sentiment.sentiment);
                            await twitterClient.post.tweet(tweet);
                            elizaLogger.success(`Posted tweet for news: ${newsItem.title}`);
                        } else {
                            // Generate internal summary if no clear consensus
                            const summary = await generateInternalSummary(newsItem);
                            elizaLogger.info(`Generated internal summary for ${newsItem.title}: ${summary}`);
                        }
                    } catch (error) {
                        elizaLogger.error(`Error processing news item ${newsItem.title}:`, error);
                    }
                }
            }, 2 * 60 * 60 * 1000); // 2 hours

            if (callback) {
                callback({
                    text: `He publicado las siguientes noticias en Telegram para recolectar opiniones:\n${topNews.map((article, index) => `${index + 1}. ${article.source}: ${article.title}`).join("\n")}`,
                    data: topNews,
                });
                return true;
            }
        } catch (error) {
            elizaLogger.error("Error fetching news or posting to Telegram", error);
            callback({
                text: "No pude procesar las noticias o publicarlas en Telegram",
                data: error,
            });
            return false;
        }
    },
    examples: getArgentinaNews as ActionExample[][],
} as Action;

async function generateNeutralSummary(title: string, description: string): Promise<string> {
    // Extract key points and generate a neutral summary
    const keyPoints = description.split('.').filter(point => point.trim().length > 0);
    return `${title}\n\nPuntos clave:\n${keyPoints.slice(0, 3).map(point => `• ${point.trim()}`).join('\n')}`;
}

async function collectTelegramResponses(telegramClient: any, groupId: string, messageId: number): Promise<Array<{ text: string; userId: number }>> {
    const replies = await telegramClient.bot.telegram.getMessageThread(groupId, messageId);
    return replies.map(reply => ({
        text: reply.text,
        userId: reply.from.id
    }));
}

async function analyzeSentiment(responses: string[]): Promise<SentimentResult> {
    // Simple sentiment analysis based on keyword matching
    const positiveWords = ['acuerdo', 'bien', 'positivo', 'excelente', 'favorable', 'apoyo'];
    const negativeWords = ['desacuerdo', 'mal', 'negativo', 'terrible', 'contra', 'rechazo'];

    let positiveCount = 0;
    let negativeCount = 0;

    responses.forEach(response => {
        const lowerResponse = response.toLowerCase();
        positiveWords.forEach(word => {
            if (lowerResponse.includes(word)) positiveCount++;
        });
        negativeWords.forEach(word => {
            if (lowerResponse.includes(word)) negativeCount++;
        });
    });

    const total = responses.length;
    const positiveRatio = positiveCount / total;
    const negativeRatio = negativeCount / total;

    if (positiveRatio > 0.6) return { sentiment: 'positive', confidence: positiveRatio };
    if (negativeRatio > 0.6) return { sentiment: 'negative', confidence: negativeRatio };
    return { sentiment: 'neutral', confidence: Math.max(1 - (positiveRatio + negativeRatio), 0.5) };
}

async function generateTweet(title: string, sentiment: string): Promise<string> {
    const prefix = sentiment === 'positive' ? '👍' : sentiment === 'negative' ? '👎' : '🤔';
    const sentimentText = sentiment === 'positive' ? 'apoya' : sentiment === 'negative' ? 'se opone a' : 'tiene opiniones mixtas sobre';
    return `${prefix} La comunidad ${sentimentText} la noticia: ${title.substring(0, 180)}`;
}

async function generateInternalSummary(newsItem: NewsAnalysis): Promise<string> {
    const responseCount = newsItem.responses[0].responses.length;
    return `Análisis de opiniones sobre: "${newsItem.title}"\n` +
           `Total de respuestas: ${responseCount}\n` +
           `Tendencia: No hay consenso claro\n` +
           `Confianza del análisis: ${newsItem.overallSentiment?.confidence.toFixed(2)}`;
}