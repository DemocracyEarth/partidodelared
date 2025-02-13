import { Plugin } from "@elizaos/core";
import { getArgentinaNewsAction } from "./actions/getArgentinaNews";

export const newsArgentinaPlugin: Plugin = {
    name: "newsArgentina",
    description: "Get news articles",
    actions: [getArgentinaNewsAction],
    evaluators: [],
    providers: [],
};

export default newsArgentinaPlugin;

