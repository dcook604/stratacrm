import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, clearCsrfToken, type MeResponse, type User } from "../lib/api";

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Convenience: returns just the User portion from useMe. */
export function useMeUser(): User | undefined {
  const { data } = useMe();
  return data?.user;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clearCsrfToken();
      qc.clear();
    },
    onError: () => {
      clearCsrfToken();
      qc.clear();
    },
  });
}
