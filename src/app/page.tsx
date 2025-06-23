'use client';

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function BrandStrategistChat() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationComplete, setConversationComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [projectId] = useState(() => uuidv4());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading || conversationComplete) return;

    const userMessage = { role: 'user' as const, content: message };
    setMessages(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/strategist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          session_id: sessionId || uuidv4(),
          project_id: projectId,
          message_type: 'user_message',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.message },
        ]);
        if (data.session_id) {
          setSessionId(data.session_id);
        }
        setConversationComplete(data.conversation_complete);
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white p-4">
        <h1 className="text-2xl font-bold">Brand Strategy Assistant</h1>
        <p className="text-sm text-indigo-100">
          Let's build your brand strategy together!
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6 max-w-md bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-2">Welcome to Your Brand Strategy Session</h2>
              <p className="text-gray-600 mb-4">
                I'll help you develop a comprehensive brand strategy. Start by telling me about your business or brand!
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-3/4 rounded-lg p-4 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-gray-200 rounded-bl-none'
                }`}
              >
                {msg.content.split('\n').map((paragraph, i) => (
                  <p key={i} className="mb-2 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg rounded-bl-none p-4 max-w-3/4">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-4 bg-white">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              conversationComplete 
                ? 'The strategy session is complete. Start a new session to continue.'
                : 'Type your message here...'
            }
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={isLoading || conversationComplete}
          />
          <button
            type="submit"
            disabled={!message.trim() || isLoading || conversationComplete}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
        {conversationComplete && (
          <div className="mt-2 text-center text-sm text-green-600">
            Strategy session complete! Your brand strategy has been saved.
          </div>
        )}
      </div>
    </div>
  );
}
