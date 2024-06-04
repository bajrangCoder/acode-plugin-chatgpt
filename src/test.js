const { LLMChain } = require("langchainjs");
const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatMistralAI } = require("@langchain/mistralai");
const { ChatAnthropic } = require("@langchain/anthropic");
const { ChatCloudflareWorkersAI } = require("@langchain/cloudflare");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");

const openaiModel = new ChatOpenAI({ model: "gpt-3.5-turbo", temperature: 0.5 });
//const googleModel = new ChatGoogleGenerativeAI({ apiKey: "YOUR_GOOGLE_API_KEY" });
const mistralModel = new ChatMistralAI({ model: "mistral-large-latest", temperature: 0.5 });
const anthropicModel = new ChatAnthropic({ model: "claude-3-sonnet-20240229", temperature: 0.5 });

async function generateResponse(llm, input) {
    const chain = new LLMChain({ llm });
    const result = await chain.call({ input });
    return result.output.text;
  }

  async function chatLoop() {
    while (true) {
      const userInput = prompt("You: ");
      console.log(`OpenAI: ${await generateResponse(openaiModel, userInput)}`);
      //console.log(`Google: ${await generateResponse(googleModel, userInput)}`);
      console.log(`Mistral: ${await generateResponse(mistralModel, userInput)}`);
      console.log(`Anthropic: ${await generateResponse(anthropicModel, userInput)}`);
    }
  }
  
  chatLoop()