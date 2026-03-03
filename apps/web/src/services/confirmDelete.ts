export const confirmDelete = (message: string): boolean => {
  return window.confirm(message);
};

export const confirmDeleteByName = (actionLabel: string, entityName: string): boolean => {
  return window.confirm(`${actionLabel}: "${entityName}"?`);
};
