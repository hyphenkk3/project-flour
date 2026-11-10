declare module "web-push" {
  export type VapidDetails = {
    subject: string;
    publicKey: string;
    privateKey: string;
  };

  export type WebPushOptions = {
    vapidDetails: VapidDetails;
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    timeout?: number;
  };

  export type WebPushSubscription = {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  };

  export function sendNotification(
    subscription: WebPushSubscription,
    payload?: string | Buffer,
    options?: WebPushOptions,
  ): Promise<{ statusCode: number; headers: Record<string, string> }>;
}
