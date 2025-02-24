export interface User {
  id: string;
  type: "user";
  email: string;
  azureSub: string;  // Azure AD sub ID
  createdAt: string;
  updatedAt: string;
  password?: string;  // Optional for non-Azure AD users
} 