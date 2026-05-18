import { toast } from 'sonner';
import { getErrorMessage } from './getErrorMessage';

interface SafeActionOptions {
  label?: string;
  showToast?: boolean;
}

/**
 * Wraps an action in a try/catch block to prevent crashes.
 * Displays an error toast if the action fails.
 */
export async function safeAction(
  action: () => Promise<any> | any, 
  options?: SafeActionOptions
) {
  try {
    const result = await action();
    return result;
  } catch (error) {
    console.error(options?.label || "Erro na ação", error);
    if (options?.showToast !== false) {
      toast.error(getErrorMessage(error));
    }
    return null;
  }
}
