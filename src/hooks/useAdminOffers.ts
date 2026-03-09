import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveAdminOffer,
  deleteAdminOffers,
  fetchAdminOffers,
  rejectAdminOffer,
  type AdminShiftOffer,
} from '@/services/adminOffers';

interface UseAdminOffersOptions {
  tenantId?: string | null;
  reviewerId?: string;
}

export function useAdminOffers({ tenantId, reviewerId }: UseAdminOffersOptions) {
  const queryClient = useQueryClient();
  const queryKey = ['admin-offers', tenantId ?? 'none'];

  const query = useQuery({
    queryKey,
    enabled: Boolean(tenantId),
    queryFn: async () => fetchAdminOffers(tenantId!),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const approveMutation = useMutation({
    mutationFn: async (offer: AdminShiftOffer) =>
      approveAdminOffer({
        tenantId: tenantId!,
        reviewerId: reviewerId!,
        offer,
      }),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: async (offer: AdminShiftOffer) =>
      rejectAdminOffer({
        tenantId: tenantId!,
        reviewerId: reviewerId!,
        offer,
      }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminOffers,
    onSuccess: invalidate,
  });

  return {
    ...query,
    offers: query.data ?? [],
    approveOffer: approveMutation.mutateAsync,
    rejectOffer: rejectMutation.mutateAsync,
    deleteOffers: deleteMutation.mutateAsync,
    isProcessingOffer:
      approveMutation.isPending || rejectMutation.isPending || deleteMutation.isPending,
  };
}
