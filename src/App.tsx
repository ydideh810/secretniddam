import { useState } from "react";
import * as webllm from "@mlc-ai/web-llm";
import UserInput from "./components/UserInput";
import useChatStore from "./hooks/useChatStore";
import ResetChatButton from "./components/ResetChatButton";
import DebugUI from "./components/DebugUI";
import ModelsDropdown from "./components/ModelsDropdown";
import MessageList from "./components/MessageList";

const appConfig = webllm.prebuiltAppConfig;
appConfig.useIndexedDBCache = true;

if (appConfig.useIndexedDBCache) {
  console.log("Using IndexedDB Cache");
} else {
  console.log("Using Cache API");
}

function App() {
  const [engine, setEngine] = useState<webllm.EngineInterface | null>(null);
  const [progress, setProgress] = useState("Not loaded");

  // Store
  const userInput = useChatStore((state) => state.userInput);
  const setUserInput = useChatStore((state) => state.setUserInput);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setIsGenerating = useChatStore((state) => state.setIsGenerating);
  const chatHistory = useChatStore((state) => state.chatHistory);
  const setChatHistory = useChatStore((state) => state.setChatHistory);

  const systemPrompt = "Your name is Niddam and you are a very helpful assistant.";
  // Respond in markdown.

  const initProgressCallback = (report: webllm.InitProgressReport) => {
    console.log(report);
    setProgress(report.text);
    setChatHistory((history) => [
      ...history.slice(0, -1),
      { role: "assistant", content: report.text },
    ]);
  };

  async function loadEngine() {
    console.log("Loading engine");

    setChatHistory((history) => [
      ...history.slice(0, -1),
      {
        role: "assistant",
        content: "Loading model... (this might take a bit)",
      },
    ]);
    const engine: webllm.EngineInterface = await webllm.CreateWebWorkerEngine(
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
      selectedModel,
      /*engineConfig=*/ {
        initProgressCallback: initProgressCallback,
        appConfig: appConfig,
      }
    );
    setEngine(engine);
    return engine;
  }

  async function onSend() {
    setIsGenerating(true);

    let loadedEngine = engine;

    // Add the user message to the chat history
    const userMessage: webllm.ChatCompletionMessageParam = {
      role: "user",
      content: userInput,
    };
    setChatHistory((history) => [
      ...history,
      userMessage,
      { role: "assistant", content: "" },
    ]);
    setUserInput("");

    // Start up the engine first
    if (!loadedEngine) {
      console.log("Engine not loaded");

      try {
        loadedEngine = await loadEngine();
      } catch (e) {
        setIsGenerating(false);
        console.error(e);
        setChatHistory((history) => [
          ...history.slice(0, -1),
          {
            role: "assistant",
            content: "Could not load the model because " + e,
          },
        ]);
        return;
      }
    }

    try {
      const completion = await loadedEngine.chat.completions.create({
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory,
          userMessage,
        ],
        temperature: 0.5,
        max_gen_len: 1024,
      });

      // Get each chunk from the stream
      let assistantMessage = "";
      for await (const chunk of completion) {
        const curDelta = chunk.choices[0].delta.content;
        if (curDelta) {
          assistantMessage += curDelta;
          // Update the last message
          setChatHistory((history) => [
            ...history.slice(0, -1),
            { role: "assistant", content: assistantMessage },
          ]);
        }
      }

      setIsGenerating(false);

      console.log(await loadedEngine.runtimeStatsText());
    } catch (e) {
      setIsGenerating(false);
      console.error("EXCEPTION");
      console.error(e);
      setChatHistory((history) => [
        ...history,
        { role: "assistant", content: "Error. Try again." },
      ]);
      return;
    }
  }

  // Load the engine on first render
  // useEffect(() => {
  //   if (!engine) {
  //     loadEngine();
  //   }
  // }, []);

  async function resetChat() {
    if (!engine) {
      console.error("Engine not loaded");
      return;
    }
    await engine.resetChat();
    setUserInput("");
    setChatHistory(() => []);
  }

  async function resetEngineAndChatHistory() {
    if (engine) {
      await engine.unload();
    }
    setEngine(null);
    setUserInput("");
    setChatHistory(() => []);
  }

  function onStop() {
    if (!engine) {
      console.error("Engine not loaded");
      return;
    }

    setIsGenerating(false);
    engine.interruptGenerate();
  }

  return (
    <div className="px-4 w-full">
      <div className="absolute top-0 left-0 p-4 flex items-center gap-2">
        <div>
    
        </div>
      </div>

      <div className="max-w-3xl mx-auto flex flex-col h-screen">
        {chatHistory.length === 0 ? (
          <div className="flex justify-center items-center h-full flex-col overflow-y-scroll">
            <img
              src="inner.png"
              alt="Niddam"
              className="mx-auto w-32  mb-4 mt-2"
            />
                      <ResetChatButton resetChat={resetChat} />
              <DebugUI loadEngine={loadEngine} progress={progress} />
             <ModelsDropdown resetEngineAndChatHistory={resetEngineAndChatHistory} />
            <div className="max-w-2xl flex flex-col justify-center">
            
              <h2 className="text-base mb-4 prose text-gray-50">
                Niddam_yar is our entry-level chatbot. Unlike
                ChatGPT, the models available here run completely within your
                browser which means:
                <ol>
                  <li className="text-base mb-4 prose text-gray-50">Your conversation data never leaves your computer.</li>
                  <li>
                    After the model is initially downloaded, you can disconnect
                    your WIFI. It will work offline.
                  </li>
                </ol>
                <p className="text-base mb-4 prose text-gray-50">
                  Note: the first message takes a while to process since
                  the model needs to be fully downloaded on your PC. But
                  on future visits, the model will load quickly
                  from the local storage on your computer.
                </p>
                <p className="text-base mb-4 prose text-gray-50">Supported browsers: Chrome, Edge (GPU required)</p>
                <p className="text-base mb-4 prose text-gray-50">Works with Firefox but needs to be enabled manually through the dom.webgpu.enabled flag</p>
                <p className="text-base mb-4 prose text-gray-50">(Note: Chatbot performance is dependent on GPU performance)</p>
                <p className="text-base mb-4 prose text-gray-50">Like Niddam? Try our <a className="text-base mb-4 prose text-gray-50" href="https://linktr.ee/Niddam">PRO</a> Version!</p>
                <form method="POST" action="https://mainnet.demo.btcpayserver.org/apps/4NvthdA3HKSgykXsYPuc7kGNYtLU/pos">
  <input type="hidden" name="email" value="customer@example.com" />
  <input type="hidden" name="orderId" value="CustomOrderId" />
  <input type="hidden" name="notificationUrl" value="https://example.com/callbacks" />
  <input type="hidden" name="redirectUrl" value="https://www.niddam.pro/" />
  <button type="submit" name="choiceKey" value="pro">Pay w/ Bitcoin</button>
</form>
              </h2>
            </div>
          </div>
        ) : (
          <MessageList />
        )}
        <UserInput onSend={onSend} onStop={onStop} />
      </div>
    </div>
  );
}

export default App;
