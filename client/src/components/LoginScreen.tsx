import { useState } from "react";
import { App, Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import { LockOutlined, SafetyCertificateOutlined } from "@ant-design/icons";

import { login } from "../api";


interface LoginScreenProps {
  onAuthorized: () => void;
  onLocked: () => void;
}


export function LoginScreen({ onAuthorized, onLocked }: LoginScreenProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [attemptHint, setAttemptHint] = useState("");

  const submit = async ({ password }: { password: string }) => {
    setLoading(true);
    try {
      const result = await login(password);
      if (result.locked) {
        onLocked();
        return;
      }
      if (result.authorized) {
        message.success("验证成功");
        onAuthorized();
        return;
      }
      const hints = [
        typeof result.remainingIpAttempts === "number"
          ? `当前 IP 还可连续尝试 ${result.remainingIpAttempts} 次`
          : "",
        typeof result.remainingDailyAttempts === "number"
          ? `今日全局还可尝试 ${result.remainingDailyAttempts} 次`
          : "",
      ].filter(Boolean);
      setAttemptHint(hints.join("；"));
      message.error(result.error || "密码错误");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "验证失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="centered-page login-page">
      <section className="brand-block" aria-label="Cloudrop">
        <div className="brand-mark"><SafetyCertificateOutlined /></div>
        <Typography.Title level={1}>Cloudrop</Typography.Title>
        <Typography.Paragraph type="secondary">
          无账户、点对点、即时传输
        </Typography.Paragraph>
      </section>
      <Card className="login-card" title="访问验证">
        <Form layout="vertical" requiredMark={false} onFinish={submit} size="large">
          <Form.Item
            name="password"
            label="部署密码"
            rules={[{ required: true, message: "请输入访问密码" }]}
          >
            <Input.Password
              autoFocus
              autoComplete="current-password"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
            />
          </Form.Item>
          {attemptHint && (
            <Alert className="attempt-alert" type="warning" showIcon title={attemptHint} />
          )}
          <Button type="primary" htmlType="submit" block loading={loading}>
            进入 Cloudrop
          </Button>
        </Form>
      </Card>
    </main>
  );
}
