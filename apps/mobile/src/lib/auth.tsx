import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getQueryParams } from "expo-auth-session/build/QueryParams";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

const redirectTo = Linking.createURL("/");

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return;
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithKakao: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    const linkSub = Linking.addEventListener("url", (event) => {
      createSessionFromUrl(event.url).catch((err) => console.warn("[auth] redirect parse failed", err));
    });

    return () => {
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      // §6: 카카오 인증. 실제 카카오 REST API 키/시크릿은 supabase/config.toml의
      // [auth.external.kakao] + Kakao Developers 콘솔 설정이 끝나야 동작한다 (Phase 2 코드는
      // 그 설정이 이미 됐다는 전제로 동작 경로만 구현한다).
      signInWithKakao: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "kakao",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === "success") {
          await createSessionFromUrl(res.url);
        }
      },
      // 개발 전용 — 카카오 콘솔 설정 전까지(§7 Phase 4~5) 실기기 E2E 테스트용 이메일/비밀번호
      // 로그인. __DEV__는 프로덕션 빌드에서 false가 되므로 로그인 화면에서도 이 경로를 숨긴다.
      signInWithEmail: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
