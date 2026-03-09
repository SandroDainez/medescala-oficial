import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelSwapRequest,
  decideSwapRequest,
  fetchEligibleSectorMembers,
  fetchUserSwapsData,
  submitSwapRequest,
  type SwapAssignment,
  type SwapRequestItem,
  type SwapTenantMember,
} from '@/services/userSwaps';

interface UseUserSwapsOptions {
  userId?: string;
  tenantId?: string | null;
}

export function useUserSwaps({ userId, tenantId }: UseUserSwapsOptions) {
  const queryClient = useQueryClient();
  const queryKey = ['user-swaps', userId, tenantId ?? 'none'];

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId && tenantId),
    queryFn: async () => fetchUserSwapsData(userId!, tenantId!),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const loadSectorMembers = async (sectorId: string, tenantMembers: SwapTenantMember[]) => {
    return fetchEligibleSectorMembers(userId!, tenantId!, sectorId, tenantMembers);
  };

  const submitMutation = useMutation({
    mutationFn: async (params: {
      currentUserDisplayName: string;
      selectedAssignment: SwapAssignment;
      selectedTargetUser: SwapTenantMember;
      reason: string;
    }) =>
      submitSwapRequest({
        tenantId: tenantId!,
        userId: userId!,
        currentUserDisplayName: params.currentUserDisplayName,
        selectedAssignment: params.selectedAssignment,
        selectedTargetUser: params.selectedTargetUser,
        reason: params.reason,
      }),
    onSuccess: invalidate,
  });

  const decideMutation = useMutation({
    mutationFn: async (params: {
      currentUserDisplayName: string;
      swap: SwapRequestItem;
      decision: 'approved' | 'rejected';
    }) =>
      decideSwapRequest({
        tenantId: tenantId!,
        userId: userId!,
        currentUserDisplayName: params.currentUserDisplayName,
        swap: params.swap,
        decision: params.decision,
      }),
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSwapRequest,
    onSuccess: invalidate,
  });

  return {
    ...query,
    myAssignments: query.data?.myAssignments ?? [],
    tenantMembers: query.data?.tenantMembers ?? [],
    mySwapRequests: query.data?.mySwapRequests ?? [],
    incomingSwapRequests: query.data?.incomingSwapRequests ?? [],
    currentUserDisplayName: query.data?.currentUserDisplayName ?? 'Um usuário',
    loadSectorMembers,
    submitSwap: submitMutation.mutateAsync,
    decideSwap: decideMutation.mutateAsync,
    cancelSwap: cancelMutation.mutateAsync,
    isSubmittingSwap: submitMutation.isPending,
    isDecidingSwap: decideMutation.isPending,
    isCancellingSwap: cancelMutation.isPending,
  };
}
