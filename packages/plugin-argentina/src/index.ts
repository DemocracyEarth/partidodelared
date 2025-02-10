import { Plugin } from "@elizaos/core";
import { getArgentinaNewsAction } from "./actions/getArgentinaNews";

export const newsPlugin: Plugin = {
    name: "news",
    description: "Get news articles",
    actions: [getArgentinaNewsAction],
    evaluators: [],
    providers: [],
};

export default newsPlugin;

