/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProcurementStatus = 
  | "REQUESTED" 
  | "APPROVED" 
  | "PENDING" 
  | "REJECTED" 
  | "PURCHASED" 
  | "NOTE_APPROVED" 
  | "PAYMENT_DONE";

export interface Procurement {
  id: string;
  userId: string;
  userName: string;
  requestDate: string;
  requestName: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  estCost: number;
  purpose: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: ProcurementStatus;
  
  // Admin fields
  adminRemarks?: string;
  
  // Purchase fields
  purchaseDate?: string;
  vendorName?: string;
  actualCost?: number;
  invoiceNumber?: string;
  purchaseRemarks?: string;
  purchaserName?: string;
  purchaserId?: string;
  additionalItems?: { description: string, cost: number }[];
  
  // Approval Note fields
  approvalNoteNo?: string;
  approvalNoteDate?: string;
  
  // Payment fields
  paymentDate?: string;
  paymentAmount?: number;
  
  createdAt: any;
  updatedAt: any;
}
