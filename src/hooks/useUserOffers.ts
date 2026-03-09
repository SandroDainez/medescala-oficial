import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelUserOffer,
  claimShiftForUser,
  fetchUserOffersData,
  type AvailableShift,
} from '@/services/userOffers';

interface UseUserOffersOptions {
  userId?: string;
  tenantId?: string | null;
}

export function useUserOffers({ userId, tenantId }: UseUserOffersOptions) {
  const queryClient = useQueryClient();
  const queryKey = ['user-offers', userId, tenantId ?? 'none'];

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId && tenantId),
    queryFn: async () => fetchUserOffersData(userId!, tenantId!),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const claimMutation = useMutation({
    mutationFn: async (params: { shift: AvailableShift; offerMessage: string; memberSectorIds: Set<string> }) =>
      claimShiftForUser({
        userId: userId!,
        tenantId: tenantId!,
        shift: params.shift,
        offerMessage: params.offerMessage,
        memberSectorIds: params.memberSectorIds,
      }),
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelUserOffer,
    onSuccess: invalidate,
  });

  return {
    ...query,
    availableShifts: query.data?.availableShifts ?? [],
    myOffers: query.data?.myOffers ?? [],
    myAssignedShiftIds: query.data?.myAssignedShiftIds ?? new Set<string>(),
    memberSectorIds: query.data?.memberSectorIds ?? new Set<string>(),
    claimShift: claimMutation.mutateAsync,
    cancelOffer: cancelMutation.mutateAsync,
    isSubmitting: claimMutation.isPending,
    isCancelling: cancelMutation.isPending,
    refetchOffers: query.refetch,
  };
}
