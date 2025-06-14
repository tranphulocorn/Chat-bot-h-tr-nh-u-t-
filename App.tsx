
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chat } from "@google/genai";
import { Message, MessageSender } from './types';
import { startChat, sendMessageToAPI } from './services/geminiService';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import FileUpload from './components/FileUpload';
import LoadingSpinner from './components/LoadingSpinner';

const ADMIN_EMAIL = 'tplocthsp@gmail.com';
const LOCAL_STORAGE_CONTEXT_KEY = 'investmentChatbot_documentContext';
const LOCAL_STORAGE_FILES_KEY = 'investmentChatbot_documentNames';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chatSession, setChatSession] = useState<Chat | null>(null);

  const [documentContext, setDocumentContext] = useState<string | null>(() => {
    return localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY);
  });
  const [documentNames, setDocumentNames] = useState<string[]>(() => {
    try {
      const storedNames = localStorage.getItem(LOCAL_STORAGE_FILES_KEY);
      return storedNames ? JSON.parse(storedNames) : [];
    } catch (e) {
      console.error("Lỗi parse tên tệp từ localStorage:", e);
      localStorage.removeItem(LOCAL_STORAGE_FILES_KEY); // Xóa dữ liệu hỏng
      return [];
    }
  });

  const [inputEmail, setInputEmail] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Khởi tạo chat và thêm tin nhắn chào mừng
    // Sau đó, nếu có ngữ cảnh từ localStorage, thêm tin nhắn thông báo
    try {
      const newChatSession = startChat();
      setChatSession(newChatSession);
      const initialBotMessages: Message[] = [{
        id: crypto.randomUUID(),
        text: "Xin chào! Tôi là trợ lý đầu tư AI của bạn. Hôm nay tôi có thể giúp bạn bắt đầu với việc đầu tư như thế nào?",
        sender: MessageSender.Bot,
        timestamp: new Date(),
      }];

      // Kiểm tra documentContext và documentNames đã được khởi tạo từ localStorage
      // Chỉ admin mới thấy thông báo này khi app load
      if (isAdminAuthenticated && localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY) && 
          (JSON.parse(localStorage.getItem(LOCAL_STORAGE_FILES_KEY) || '[]')).length > 0) {
        initialBotMessages.push({
          id: crypto.randomUUID(),
          text: `Đang sử dụng ngữ cảnh từ các tài liệu đã lưu: ${(JSON.parse(localStorage.getItem(LOCAL_STORAGE_FILES_KEY) || '[]')).join(', ')}.`,
          sender: MessageSender.Bot,
          timestamp: new Date(),
          isContextNotification: true,
        });
      }
      setMessages(initialBotMessages);
      setError(null);
    } catch (e) {
      console.error("Không thể khởi tạo chat:", e);
      setError("Không thể khởi tạo phiên chat. Vui lòng đảm bảo API key của bạn được cấu hình đúng.");
    }
  }, [isAdminAuthenticated]); // Thêm isAdminAuthenticated vào dependencies để cập nhật khi admin đăng nhập


  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (inputEmail.trim().toLowerCase() === ADMIN_EMAIL) {
      setIsAdminAuthenticated(true);
      setInputEmail('');
      // Nếu có context đã lưu, và admin vừa đăng nhập, thêm tin nhắn thông báo context
      if (localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY) && 
          (JSON.parse(localStorage.getItem(LOCAL_STORAGE_FILES_KEY) || '[]')).length > 0) {
        setMessages(prevMessages => [...prevMessages, {
          id: crypto.randomUUID(),
          text: `Đang sử dụng ngữ cảnh từ các tài liệu đã lưu: ${(JSON.parse(localStorage.getItem(LOCAL_STORAGE_FILES_KEY) || '[]')).join(', ')}.`,
          sender: MessageSender.Bot,
          timestamp: new Date(),
          isContextNotification: true,
        }]);
      }
    } else {
      setAuthError("Email không đúng. Vui lòng thử lại.");
      setIsAdminAuthenticated(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setInputEmail('');
    setAuthError(null);
  };

  const handleSendMessage = async (inputText: string) => {
    if (!inputText.trim() || !chatSession) return;

    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      text: inputText,
      sender: MessageSender.User,
      timestamp: new Date(),
    };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const botResponseText = await sendMessageToAPI(chatSession, inputText, documentContext);
      const newBotMessage: Message = {
        id: crypto.randomUUID(),
        text: botResponseText,
        sender: MessageSender.Bot,
        timestamp: new Date(),
      };
      setMessages(prevMessages => [...prevMessages, newBotMessage]);
    } catch (e) {
      console.error("Lỗi gửi tin nhắn hoặc nhận phản hồi:", e);
      const errorMessage = e instanceof Error ? e.message : "Đã xảy ra lỗi không xác định.";
      setError(`Không thể nhận phản hồi: ${errorMessage}`);
      const errorBotMessage: Message = {
        id: crypto.randomUUID(),
        text: `Xin lỗi, tôi gặp lỗi: ${errorMessage}`,
        sender: MessageSender.Bot,
        timestamp: new Date(),
      };
      setMessages(prevMessages => [...prevMessages, errorBotMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (content: string, fileNames: string[]) => {
    setDocumentContext(content);
    setDocumentNames(fileNames);
    localStorage.setItem(LOCAL_STORAGE_CONTEXT_KEY, content);
    localStorage.setItem(LOCAL_STORAGE_FILES_KEY, JSON.stringify(fileNames));

    const fileNamesString = fileNames.join(', ');
    const contextUpdateMessage: Message = {
      id: crypto.randomUUID(),
      text: `Các tài liệu "${fileNamesString}" đã được tải lên và lưu lại. Nội dung sẽ được dùng làm ngữ cảnh cho câu hỏi của bạn.`,
      sender: MessageSender.Bot,
      timestamp: new Date(),
      isContextNotification: true,
    };
    // Chỉ hiển thị thông báo tải lên chi tiết cho admin
    if (isAdminAuthenticated) {
        setMessages(prevMessages => [...prevMessages, contextUpdateMessage]);
    } else {
         // Với người dùng thường, có thể chỉ cần một thông báo chung hoặc không có gì cả
         // ở đây ta chọn không thêm gì để tránh lộ thông tin admin đã cập nhật context
    }
  };

  const handleClearDocumentContext = () => {
    setDocumentContext(null);
    setDocumentNames([]);
    localStorage.removeItem(LOCAL_STORAGE_CONTEXT_KEY);
    localStorage.removeItem(LOCAL_STORAGE_FILES_KEY);
    
    // Chỉ hiển thị thông báo xóa context chi tiết cho admin
    if (isAdminAuthenticated) {
        setMessages(prevMessages => [...prevMessages, {
          id: crypto.randomUUID(),
          text: "Ngữ cảnh tài liệu đã được xóa khỏi bộ nhớ.",
          sender: MessageSender.Bot,
          timestamp: new Date(),
          isContextNotification: true,
        }]);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white shadow-xl">
      <header className="bg-primary text-white p-4 shadow-md flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
        <h1 className="text-xl sm:text-2xl font-semibold">Chatbot Cố Vấn Đầu Tư</h1>
        <div>
          {isAdminAuthenticated ? (
            <div className="flex items-center">
              <span className="text-sm mr-3">Quyền quản trị đã kích hoạt</span>
              <button
                onClick={handleAdminLogout}
                className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded text-sm"
              >
                Đăng xuất quản trị
              </button>
            </div>
          ) : (
            <form onSubmit={handleAdminLogin} className="flex items-center space-x-2">
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="Nhập email quản trị"
                className="px-2 py-1 rounded text-sm text-neutral-dark focus:ring-2 focus:ring-primary-light outline-none"
                required
              />
              <button
                type="submit"
                className="bg-secondary hover:bg-secondary-dark text-white py-1 px-3 rounded text-sm"
              >
                Đăng nhập Q.Trị
              </button>
            </form>
          )}
        </div>
      </header>
      {authError && (
        <div className="p-2 bg-red-100 text-red-700 text-sm text-center">
          {authError}
        </div>
      )}

      {error && (
         <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700">
           <p className="font-bold">Lỗi</p>
           <p>{error}</p>
         </div>
       )}

      <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-neutral-light">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && <div className="flex justify-center my-2"><LoadingSpinner /></div>}
        <div ref={messagesEndRef} />
      </div>

      {isAdminAuthenticated && documentNames.length > 0 && (
        <div className="p-3 bg-primary-light border-t border-primary text-primary-dark text-sm flex justify-between items-center">
          <span>Đang dùng ngữ cảnh từ: <strong>{documentNames.join(', ')}</strong></span>
          <button
            onClick={handleClearDocumentContext}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
            aria-label="Xóa ngữ cảnh tài liệu hiện tại"
          >
            Xóa Ngữ Cảnh
          </button>
        </div>
      )}

      <div className="p-4 border-t border-gray-200 bg-white">
        <FileUpload 
          onFileUpload={handleFileUpload} 
          isAuthorized={isAdminAuthenticated}
        />
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default App;
