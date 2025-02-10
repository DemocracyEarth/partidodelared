import { ActionExample } from "@elizaos/core";

export const getArgentinaNews: ActionExample[][] = [
    [
        {
            user: "{{user1}}",
            content: {
                text: "Get the latest news from Argentina",
            }
        },
        {
            user: "{{agent}}",
            content: {
                text: "Here are the latest news from Argentina",
            },
        },
    ],
];

export const getGlobalNews: ActionExample[][] = [
    [
        {
            user: "{{user1}}",
            content: {
                text: "Get the latest news from the world",
            },
        },
        {
            user: "{{agent}}",
            content: {
                text: "Here are the latest news from the world",
            },
        },
    ],
];
