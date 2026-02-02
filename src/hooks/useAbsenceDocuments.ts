import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';

interface UploadResult {
  filePath: string;
  success: boolean;
}

interface DownloadResult {
  downloadUrl: string;
  expiresIn: number;
}

export function useAbsenceDocuments() {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  const { currentTenantId } = useTenant();

  const getUploadUrl = useCallback(async (): Promise<{ uploadUrl: string; filePath: string; token: string } | null> => {
    if (!currentTenantId) {
      toast({ title: 'Erro', description: 'Tenant não selecionado', variant: 'destructive' });
      return null;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Erro', description: 'Não autenticado', variant: 'destructive' });
        return null;
      }

      const response = await supabase.functions.invoke('absence-document-url', {
        body: {
          action: 'upload',
          tenantId: currentTenantId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Erro ao gerar URL de upload');
      }

      return {
        uploadUrl: response.data.uploadUrl,
        filePath: response.data.filePath,
        token: response.data.token,
      };
    } catch (error) {
      console.error('Error getting upload URL:', error);
      toast({ 
        title: 'Erro ao preparar upload', 
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive' 
      });
      return null;
    }
  }, [currentTenantId, toast]);

  const uploadDocument = useCallback(async (file: File): Promise<UploadResult | null> => {
    if (!currentTenantId) {
      toast({ title: 'Erro', description: 'Tenant não selecionado', variant: 'destructive' });
      return null;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ 
        title: 'Tipo de arquivo inválido', 
        description: 'Apenas PDF, JPEG, PNG e WEBP são permitidos',
        variant: 'destructive' 
      });
      return null;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ 
        title: 'Arquivo muito grande', 
        description: 'O tamanho máximo é 10MB',
        variant: 'destructive' 
      });
      return null;
    }

    setUploading(true);

    try {
      const urlData = await getUploadUrl();
      if (!urlData) {
        return null;
      }

      // Upload file using the signed URL
      const uploadResponse = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Falha ao fazer upload do arquivo');
      }

      return {
        filePath: urlData.filePath,
        success: true,
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({ 
        title: 'Erro ao fazer upload', 
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive' 
      });
      return null;
    } finally {
      setUploading(false);
    }
  }, [currentTenantId, toast, getUploadUrl]);

  const getDownloadUrl = useCallback(async (filePath: string): Promise<DownloadResult | null> => {
    if (!currentTenantId) {
      toast({ title: 'Erro', description: 'Tenant não selecionado', variant: 'destructive' });
      return null;
    }

    if (!filePath) {
      toast({ title: 'Erro', description: 'Documento não encontrado', variant: 'destructive' });
      return null;
    }

    setDownloading(true);

    try {
      const response = await supabase.functions.invoke('absence-document-url', {
        body: {
          action: 'download',
          filePath,
          tenantId: currentTenantId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Erro ao gerar URL de download');
      }

      return {
        downloadUrl: response.data.downloadUrl,
        expiresIn: response.data.expiresIn,
      };
    } catch (error) {
      console.error('Error getting download URL:', error);
      toast({ 
        title: 'Erro ao acessar documento', 
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive' 
      });
      return null;
    } finally {
      setDownloading(false);
    }
  }, [currentTenantId, toast]);

  const downloadDocument = useCallback(async (filePath: string, fileName?: string) => {
    const result = await getDownloadUrl(filePath);
    if (!result) return;

    // Open in new tab or trigger download
    const link = document.createElement('a');
    link.href = result.downloadUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (fileName) {
      link.download = fileName;
    }
    link.click();
  }, [getDownloadUrl]);

  const deleteDocument = useCallback(async (filePath: string, absenceId?: string): Promise<boolean> => {
    if (!currentTenantId) {
      toast({ title: 'Erro', description: 'Tenant não selecionado', variant: 'destructive' });
      return false;
    }

    try {
      const response = await supabase.functions.invoke('absence-document-url', {
        body: {
          action: 'delete',
          filePath,
          absenceId,
          tenantId: currentTenantId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Erro ao excluir documento');
      }

      toast({ title: 'Documento excluído com sucesso' });
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({ 
        title: 'Erro ao excluir documento', 
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive' 
      });
      return false;
    }
  }, [currentTenantId, toast]);

  return {
    uploadDocument,
    downloadDocument,
    getDownloadUrl,
    deleteDocument,
    uploading,
    downloading,
  };
}
