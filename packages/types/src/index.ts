// ── Entity Types ─────────────────────────────

export interface Site {
  id: string;
  name: string;
  protect_url: string;
  protect_key: string;
  timezone: string;
  created_at: string;
}

export interface User {
  id: string;
  site_id: string;
  email: string;
  password_hash: string;
  role: "admin" | "operator" | "viewer";
  created_at: string;
}

export interface Camera {
  id: string;
  site_id: string;
  protect_id: string;
  name: string;
  enabled: boolean;
  zone_config: Record<string, unknown> | null;
  created_at: string;
}

export type ListType = "ban" | "watch" | "vip";

export interface Subject {
  [key: string]: unknown;
  id: string;
  site_id: string;
  display_name: string;
  list_type: ListType;
  reason: string | null;
  added_by: string;
  expires_at: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface FaceEnrollment {
  id: string;
  subject_id: string;
  embedding: number[];
  source_path: string | null;
  quality: number | null;
  created_at: string;
}

export type ReviewStatus = "pending" | "confirmed" | "dismissed";

export interface DetectionEvent {
  [key: string]: unknown;
  id: string;
  site_id: string;
  camera_id: string;
  protect_event_id: string | null;
  event_type: string;
  detected_at: string;
  snapshot_path: string | null;
  best_face_crop: string | null;
  embedding: number[] | null;
  match_subject_id: string | null;
  match_distance: number | null;
  match_confidence: number | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type AlertStatus = "queued" | "sent" | "failed";

export interface Alert {
  id: string;
  detection_event_id: string;
  channel: string;
  destination: string;
  payload: Record<string, unknown> | null;
  sent_at: string | null;
  status: AlertStatus;
  error: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  site_id: string;
  user_id: string;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

// ── API Request/Response Types ───────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, "password_hash">;
}

export interface AuthUser {
  id: string;
  site_id: string;
  email: string;
  role: User["role"];
}

export interface PaginatedRequest {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface CreateSubjectRequest {
  display_name: string;
  list_type: ListType;
  reason?: string;
  expires_at?: string;
  notes?: string;
}

export interface UpdateSubjectRequest {
  display_name?: string;
  list_type?: ListType;
  reason?: string;
  expires_at?: string | null;
  active?: boolean;
  notes?: string;
}

export interface EnrollFaceRequest {
  image: Uint8Array;
}

export interface EnrollFaceResponse {
  enrollment_id: string;
  quality: number;
}

export interface ReviewEventRequest {
  review_status: ReviewStatus;
}

export interface EventsFilterRequest extends PaginatedRequest {
  camera_id?: string;
  event_type?: string;
  review_status?: ReviewStatus;
  from?: string;
  to?: string;
}

export interface DetectionResult {
  faces: Array<{
    bbox: [number, number, number, number];
    confidence: number;
    embedding: number[];
    quality: number;
  }>;
}

export interface MatchResult {
  subject_id: string;
  distance: number;
  confidence: number;
  list_type: ListType;
  display_name: string;
}

// ── WebSocket Event Types ────────────────────

export type WsEventType =
  | "detection"
  | "alert"
  | "camera_status"
  | "system";

export interface WsMessage {
  type: WsEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}
