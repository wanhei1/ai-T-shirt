"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { useLanguage, type LanguageText } from "@/contexts/language-context";

export function ApiConnectionTest() {
  const [connectionStatus, setConnectionStatus] = useState<{
    status: "testing" | "connected" | "failed";
    message: LanguageText;
    data?: Record<string, unknown>;
  }>({
    status: "testing",
    message: { zh: "正在测试连接...", en: "Testing connection..." },
  });
  const { translate } = useLanguage();

  const testConnection = useCallback(async () => {
    try {
      setConnectionStatus({
        status: "testing",
        message: { zh: "正在测试连接...", en: "Testing connection..." },
      });

      const result = await apiClient.testConnection();

      if (result.success) {
        setConnectionStatus({
          status: "connected",
          message: {
            zh: "后端连接成功！",
            en: "Successfully connected to backend!",
          },
          data: result.data,
        });
      } else {
        setConnectionStatus({
          status: "failed",
          message: {
            zh: `连接失败：${result.error}`,
            en: `Connection failed: ${result.error}`,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConnectionStatus({
        status: "failed",
        message: {
          zh: `连接失败：${errorMessage}`,
          en: `Connection failed: ${errorMessage}`,
        },
      });
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void testConnection();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [testConnection]);

  const getStatusColor = () => {
    switch (connectionStatus.status) {
      case "testing":
        return "text-yellow-600";
      case "connected":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus.status) {
      case "testing":
        return "⏳";
      case "connected":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "❓";
    }
  };

  return (
    <div className="border rounded-lg p-4 m-4 bg-white shadow">
      <h3 className="text-lg font-semibold mb-2">
        {translate({ zh: "后端连接状态", en: "Backend Connection Status" })}
      </h3>

      <div className={`flex items-center space-x-2 ${getStatusColor()}`}>
        <span className="text-xl">{getStatusIcon()}</span>
        <span className="font-medium">
          {translate(connectionStatus.message)}
        </span>
      </div>

      {connectionStatus.data && (
        <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
          <pre>{JSON.stringify(connectionStatus.data, null, 2)}</pre>
        </div>
      )}

      <button
        onClick={() => void testConnection()}
        className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        {translate({ zh: "重新测试连接", en: "Test Connection Again" })}
      </button>
    </div>
  );
}
