import { useCallback, useMemo, useRef, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Progress,
  QRCode,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  CopyOutlined,
  DisconnectOutlined,
  DownloadOutlined,
  FileOutlined,
  InboxOutlined,
  LinkOutlined,
  LogoutOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import { useSessionSocket } from "../hooks/useSessionSocket";
import { useWebRtcTransfer } from "../hooks/useWebRtcTransfer";
import type { SignalKind, TransferItem } from "../types";


interface WorkspaceProps {
  onLocked: () => void;
  onUnauthorized: () => void;
  onLogout: () => void;
}

const KEY_ALPHABET = new Set("ABCDEFGHJKMNPQRSTUVWXYZ23456789_@$&".split(""));


function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
}


function transferStatus(item: TransferItem): { color: string; text: string } {
  const labels: Record<TransferItem["status"], { color: string; text: string }> = {
    offered: { color: "gold", text: "等待接收" },
    waiting: { color: "blue", text: "等待对方确认" },
    sending: { color: "processing", text: "正在发送" },
    receiving: { color: "processing", text: "正在接收" },
    complete: { color: "success", text: "已完成" },
    cancelled: { color: "default", text: "已取消" },
    failed: { color: "error", text: "失败" },
  };
  return labels[item.status];
}


export function Workspace({ onLocked, onUnauthorized, onLogout }: WorkspaceProps) {
  const { message } = App.useApp();
  const [manualKey, setManualKey] = useState("");
  const [composer, setComposer] = useState("");
  const signalHandlerRef = useRef<
    ((kind: SignalKind, payload: Record<string, unknown>) => void) | undefined
  >(undefined);
  const notifyError = useCallback((text: string) => void message.error(text), [message]);
  const notifyInfo = useCallback((text: string) => void message.info(text), [message]);
  const receiveSignal = useCallback((kind: SignalKind, payload: Record<string, unknown>) => {
    signalHandlerRef.current?.(kind, payload);
  }, []);

  const session = useSessionSocket({
    onLocked,
    onUnauthorized,
    onError: notifyError,
    onInfo: notifyInfo,
    onSignal: receiveSignal,
  });
  const rtc = useWebRtcTransfer({
    pairInfo: session.pairInfo,
    iceServers: session.iceServers,
    maxFileSize: session.maxFileSize,
    sendSignal: session.sendSignal,
    onError: notifyError,
    onInfo: notifyInfo,
  });
  signalHandlerRef.current = rtc.handleSignal;

  const pairUrl = useMemo(
    () => session.pairKey
      ? `${window.location.origin}/?pair=${encodeURIComponent(session.pairKey)}`
      : "",
    [session.pairKey],
  );

  const submitPair = () => {
    if (session.pair(manualKey)) setManualKey("");
  };

  const submitMessage = () => {
    if (session.sendChat(composer)) setComposer("");
  };

  const sanitizeKey = (value: string) =>
    [...value.toUpperCase()]
      .filter((character) => KEY_ALPHABET.has(character))
      .slice(0, 8)
      .join("");

  const copyText = async (value: string, successText = "已复制") => {
    await navigator.clipboard.writeText(value);
    message.success(successText);
  };

  const connectionTag = {
    connecting: { color: "processing", text: "正在连接" },
    waiting: { color: "gold", text: "等待配对" },
    paired: { color: "success", text: "已配对" },
    disconnected: { color: "error", text: "正在重连" },
  }[session.connection];

  const rtcTag = {
    idle: { color: "default", text: "文件通道未连接" },
    connecting: { color: "processing", text: "正在建立文件通道" },
    ready: { color: "success", text: "文件通道已就绪" },
    failed: { color: "error", text: "文件通道连接失败" },
  }[rtc.rtcState];

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <Typography.Title level={2}>Cloudrop</Typography.Title>
          <Typography.Text type="secondary">内容只在当前页面中保留</Typography.Text>
        </div>
        <Space wrap>
          <Tag color={connectionTag.color}>{connectionTag.text}</Tag>
          <Tag color={rtcTag.color}>{rtcTag.text}</Tag>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>退出访问</Button>
        </Space>
      </header>

      <section className="workspace-grid">
        <Card className="pair-card" title="配对连接">
          {session.connection === "waiting" && session.pairKey ? (
            <div className="pair-content">
              <div className="key-panel">
                <Typography.Text type="secondary">我的配对 Key</Typography.Text>
                <button
                  type="button"
                  className="pair-key"
                  onClick={() => void copyText(session.pairKey, "配对 Key 已复制")}
                  aria-label="复制配对 Key"
                >
                  {session.pairKey}
                  <CopyOutlined />
                </button>
                <Typography.Paragraph type="secondary">
                  对方可以扫码打开网页，验证访问密码后自动发起配对。
                </Typography.Paragraph>
              </div>
              <QRCode value={pairUrl} size={184} errorLevel="M" status="active" />
            </div>
          ) : session.connection === "paired" ? (
            <Alert
              type="success"
              showIcon
              title="已与另一页面建立独占配对"
              description="当前页面不能再配对其他 Key。任意一方关闭页面后，连接立即失效，存活页面会生成新 Key。"
              action={
                <Button danger icon={<DisconnectOutlined />} onClick={session.leave}>
                  断开配对
                </Button>
              }
            />
          ) : (
            <Alert type="info" showIcon title="正在建立实时连接…" />
          )}

          <div className="manual-pair">
            <Typography.Text strong>输入他人的配对 Key</Typography.Text>
            <Space.Compact block>
              <Input
                aria-label="他人的配对 Key"
                value={manualKey}
                onChange={(event) => setManualKey(sanitizeKey(event.target.value))}
                onPressEnter={submitPair}
                maxLength={8}
                placeholder="例如 A7K_2$Q&"
                disabled={session.connection !== "waiting"}
              />
              <Button
                type="primary"
                onClick={submitPair}
                disabled={session.connection !== "waiting" || manualKey.length !== 8}
              >
                配对
              </Button>
            </Space.Compact>
          </div>
        </Card>

        <Card className="transfer-card" title="实时文件传输">
          <Alert
            className="privacy-alert"
            type="info"
            showIcon
            title="文件不会上传到 Cloudrop 服务器"
            description="优先浏览器直连，无法直连时由 TURN 实时中继；双方必须保持页面在线。"
          />
          <Upload
            beforeUpload={(file) => {
              rtc.offerFile(file);
              return Upload.LIST_IGNORE;
            }}
            showUploadList={false}
            maxCount={1}
            disabled={session.connection !== "paired" || rtc.rtcState !== "ready"}
          >
            <Button
              block
              size="large"
              icon={<InboxOutlined />}
              disabled={session.connection !== "paired" || rtc.rtcState !== "ready"}
            >
              选择文件发送（最大 1 GB）
            </Button>
          </Upload>

          <div className="transfer-list" aria-live="polite">
            {rtc.transfers.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件传输" />
            ) : (
              rtc.transfers.map((item) => {
                const status = transferStatus(item);
                const active = ["waiting", "sending", "receiving"].includes(item.status);
                return (
                  <article className="transfer-item" key={item.id}>
                    <div className="transfer-heading">
                      <FileOutlined />
                      <div className="transfer-name">
                        <Typography.Text ellipsis={{ tooltip: item.name }}>{item.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          {item.direction === "sent" ? "发送" : "接收"} · {formatBytes(item.size)}
                        </Typography.Text>
                      </div>
                      <Tag color={status.color}>{status.text}</Tag>
                    </div>
                    {(active || item.status === "complete") && (
                      <Progress
                        percent={item.progress}
                        status={item.status === "failed" ? "exception" : undefined}
                        size="small"
                      />
                    )}
                    {item.speed > 0 && active && (
                      <Typography.Text type="secondary">{formatBytes(item.speed)}/s</Typography.Text>
                    )}
                    {item.error && <Typography.Text type="danger">{item.error}</Typography.Text>}
                    <Space wrap>
                      {item.status === "offered" && (
                        <>
                          <Button type="primary" onClick={() => void rtc.acceptFile(item.id)}>接收</Button>
                          <Button onClick={() => rtc.rejectFile(item.id)}>拒绝</Button>
                        </>
                      )}
                      {active && (
                        <Button danger onClick={() => rtc.cancelTransfer(item.id)}>取消</Button>
                      )}
                      {item.downloadUrl && (
                        <a
                          className="download-link"
                          href={item.downloadUrl}
                          download={item.name}
                          onClick={() => rtc.releaseReceived(item.id)}
                        >
                          <DownloadOutlined />
                          保存文件
                        </a>
                      )}
                    </Space>
                  </article>
                );
              })
            )}
          </div>
        </Card>

        <Card className="message-card" title="文本与链接">
          <div className="message-list" aria-live="polite">
            {session.messages.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="配对后可发送文本或链接" />
            ) : (
              session.messages.map((item) => (
                <article className={`message-bubble ${item.direction}`} key={item.id}>
                  <div className="message-meta">
                    <Typography.Text type="secondary">
                      {item.direction === "sent" ? "我" : "对方"}
                    </Typography.Text>
                    {item.kind === "link" && <Tag icon={<LinkOutlined />}>链接</Tag>}
                  </div>
                  {item.kind === "link" ? (
                    <a href={item.content} target="_blank" rel="noreferrer">{item.content}</a>
                  ) : (
                    <Typography.Paragraph>{item.content}</Typography.Paragraph>
                  )}
                  <Tooltip title="复制">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => void copyText(item.content)}
                      aria-label="复制内容"
                    />
                  </Tooltip>
                </article>
              ))
            )}
          </div>
          <div className="composer">
            <Input.TextArea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              rows={3}
              maxLength={65536}
              showCount
              placeholder="输入文本或以 http://、https:// 开头的链接"
              disabled={session.connection !== "paired"}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={submitMessage}
              disabled={session.connection !== "paired" || !composer.trim()}
            >
              发送
            </Button>
          </div>
        </Card>
      </section>

      <footer className="workspace-footer">
        <ThunderboltOutlined />
        <Typography.Text type="secondary">
          文本不落库，文件不落服务器；关闭或刷新页面会结束当前配对。
        </Typography.Text>
      </footer>
    </main>
  );
}
