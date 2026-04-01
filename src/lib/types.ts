
'use client';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  password?: string; // Should not be stored in client state, only for creation.
  role: 'seller' | 'admin' | 'super_admin';
  status?: 'active' | 'archived';
  createdAt?: any; // Allow for server timestamp
  firstName?: string;
  lastName?: string;
  phone?: string;
  contactEmail?: string;
  lineId?: string;
  dob?: any;
  bankName?: string;
  bankAccountNumber?: string;
  nationalIdCardUrl?: string;
  faceImageUrl?: string;
  pointsBalance?: number;
  permissions?: string[]; // Added for Admin Role-Based Access Control
  
  // Address Fields
  address?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  country?: string;
  postalCode?: string;
};

export type AppUser = UserProfile;

export type BranchType = 'MAIN' | 'SUB';
export type BranchStatus = 'OPERATING' | 'FOLLOW_UP' | 'SUSPENDED' | 'CLOSED';
export type BillingCycle = 'MONTHLY' | 'YEARLY' | 'NONE';
export type ContractStatus = 'ACTIVE' | 'CANCELLED';

export type RecurringFeeRule = {
  id: string; // Stable internal ID
  label: string;
  amount: number;
  cycle: BillingCycle;
  gracePeriodDays: number; // Configurable days to pay
  nextBillingDate?: any;
  billingEndDate?: any;
};

export type ContractRecord = {
  id: string; // Stable internal ID
  documentIds: string[]; 
  startDate: any;
  expiryDate: any;
  notes?: string;
  securityDeposit?: number; 
  interestRate?: number; 
  recurringFees?: RecurringFeeRule[];
  status: ContractStatus; // New: status per contract
};

export type LalamoveVehicle = {
  id: string;
  type: string;
  price: number;
  maxCapacity: number;
};

export type LalamoveConfig = {
  enabled: boolean;
  vehicles: LalamoveVehicle[];
};

export type Branch = {
  id: string;
  branchCode: string;
  name: string;
  ownerId?: string;
  ownerName?: string;
  type: BranchType;
  address: string;
  phone?: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
  googleMapsUrl?: string;
  
  contracts?: ContractRecord[];

  // Shipping privileges
  freeShippingEnabled?: boolean;

  // Lalamove Configuration
  lalamoveConfig?: LalamoveConfig;

  // Current terms (Denormalized for convenience, but source of truth is contracts array)
  recurringFees?: RecurringFeeRule[];
  securityDeposit?: number; 

  status: BranchStatus;
  imageUrl?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type FeeInvoiceStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'CANCELLED';

export type FeeInvoice = {
  id: string;
  branchId: string;
  branchName: string;
  ownerId: string;
  amount: number;
  status: FeeInvoiceStatus;
  dueDate: any;
  billingPeriod: string;
  contractIdKey: string; // Internal mapping
  feeRuleId?: string; // Stable rule link
  createdAt: any;
  updatedAt: any;
  paymentNotes?: string; // Added for manual payment notes
  processedById?: string; // Admin who last processed this invoice
  processedByName?: string; // Name of the admin for display
};

export type FeeItemTemplate = {
  id: string;
  name: string;
};

export type Address = {
  id: string;
  label?: string;
  isDefault?: boolean;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country?: string;
  googleMapsUrl: string;
};

export type SenderAddress = {
  name: string;
  street: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  phone: string;
};

export type ProductGroup = {
  id: string;
  sellerId: string;
  name: string;
  description?: string;
  category: string;
  categoryA?: string;
  categoryB?: string;
  categoryC?: string;
  brand?: string;
  unit: string;
  status: 'active' | 'draft' | 'archived';
  options: {
    name: string;
    values: string[];
  }[];
  createdAt: any; 
  customFields?: Record<string, string>;
};

export type PriceTier = {
  minQuantity: number;
  price: number;
};

export type InventoryLot = {
  lotId: string;
  supplierId?: string; 
  purchaseOrderNumber?: string; 
  quantity: number;
  cost: number;
  receivedAt: any;
};

export type TaxStatus = 'TAXABLE' | 'EXEMPT';
export type TaxMode = 'INCLUSIVE' | 'EXCLUSIVE';

export type ProductVariant = {
  id:string;
  productGroupId: string;
  attributes: Record<string, string>; 
  price: number;
  priceTiers?: PriceTier[];
  compareAtPrice?: number | null;
  imageUrls?: string[];
  sku: string;
  barcode?: string;
  inventoryLots: InventoryLot[];
  lowStockThreshold?: number | null;
  weight: number;
  fixedShippingCost?: number | null;
  lalamoveCapacityUnit?: number | null;
  createdAt: any; 
  trackInventory: boolean;
  requiresShipping: boolean;
  status?: 'active' | 'archived';
  
  taxStatus: TaxStatus;
  taxMode: TaxMode;
  taxRate: number;
};

export interface Product extends Omit<ProductVariant, 'status'> {
  name: string;
  description?: string;
  category: string;
  brand?: string;
  unit: string;
  priceType: any;
  status: 'active' | 'draft' | 'archived';
  sellerId: string;
};

export type ProductPackageItem = {
  productGroupId: string;
  productVariantId: string;
  quantity: number;
};

export type ProductPackage = {
  id: string;
  name: string;
  description?: string;
  price: number;
  totalRetailPrice?: number; 
  weight: number; 
  sku: string;
  imageUrls?: string[];
  status: 'active' | 'draft' | 'archived';
  items: ProductPackageItem[];
  createdAt: any; 
  
  taxStatus?: TaxStatus;
  taxMode?: TaxMode;
  taxRate?: number;
};

export type Service = {
  id: string;
  sellerId: string;
  name: string;
  sku?: string;
  description?: string;
  category: string;
  categoryA?: string;
  categoryB?: string;
  categoryC?: string;
  price: number;
  imageUrls?: string[];
  status: 'active' | 'draft' | 'archived';
  createdAt: any;
  updatedAt?: any;
  
  taxStatus: TaxStatus;
  taxMode: TaxMode;
  taxRate: number;
};

export type CartItem = {
  id: string; 
  quantity: number;
  type: 'PRODUCT' | 'PACKAGE' | 'SERVICE';
  item: Product | ProductPackage | Service;
};

export type OrderStatus = 'PENDING_PAYMENT' | 'PROCESSING' | 'READY_TO_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export type PaymentRecord = {
  id: string;
  amount: number;
  slipUrl: string;
  createdAt: any;
  adminId?: string;
  adminName?: string;
  note?: string;
};

export type Order = {
  id: string; 
  buyerId: string;
  buyerName?: string; // Account owner's name
  guestId?: string; // Reference for non-account holders (phone-based)
  branchId?: string;
  branchName?: string;
  sellerIds: string[];
  totalAmount: number;
  paidAmount?: number; // Total amount paid so far
  balanceAmount?: number; // Remaining balance to be paid
  payments?: PaymentRecord[]; // History of payments
  status: OrderStatus;
  orderDate: any; 
  customerName: string; // Shipping recipient name
  shippingAddress: Omit<Address, 'id' | 'label' | 'isDefault'>;
  paymentSlipUrl?: string;
  shippingMethod?: string;
  shippingCost?: number;
  shippingMethodId?: string;
  shipments?: { id: string; carrier: string; trackingNumber: string; }[];
  shipmentProofImageUrls?: string[];
  pointsUsed?: number;
  pointsDiscount?: number;
  expiresAt?: any; 
  isNew?: boolean;
  updatedAt?: any;
  isServiceOnly?: boolean;
  isExternal?: boolean;

  // Lalamove info
  lalamoveVehicle?: {
    type: string;
    price: number;
  };

  taxRate: number;
  taxAmount: number;
  taxableAmount: number;
  nonTaxableAmount: number;
  subtotalBeforeTax: number;
};

export type OrderItem = {
  id?: string;
  orderId: string;
  productGroupId?: string;
  type?: 'PRODUCT' | 'PACKAGE' | 'SERVICE';
  productId: string;
  productName: string;
  productImage?: string;
  quantity: number;
  itemPrice: number;
  fulfilledFromLots?: { lotId: string; quantity: number; costPerItem: number; }[];
  
  taxStatus?: TaxStatus;
  taxMode?: TaxMode;
  taxRate?: number;
};

export type StockAdjustmentTransaction = {
  id: string;
  productVariantId: string;
  lotId: string;
  adminUserId: string;
  adminName?: string; 
  type: 'ADJUST_ADD' | 'ADJUST_DEDUCT' | 'PURCHASE' | 'SALE' | 'RETURN' | 'WASTAGE' | 'MANUAL_ENTRY';
  quantity: number; 
  reason: string;
  createdAt: any;
};

export type Bank = {
  id: string;
  name: string;
};

export type Carrier = {
  id: string;
  name: string;
};

export type Country = {
  id: string;
  name: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  code: string;
  level: 'A' | 'B' | 'C';
  parentId: string | null;
  sortOrder: number;
  status: 'active' | 'archived';
  productCount?: number;
  subCategories?: ProductCategory[];
};

export type ServiceCategory = {
  id: string;
  name: string;
  code: string;
  level: 'A' | 'B' | 'C';
  parentId: string | null;
  sortOrder: number;
  status: 'active' | 'archived';
  serviceCount?: number;
  subCategories?: ServiceCategory[];
};

export type Unit = {
  id: string;
  name: string;
};

export type PointTransaction = {
  id: string;
  userId: string;
  type: 'EARN_PURCHASE' | 'REDEEM_DISCOUNT' | 'BONUS_SIGNUP' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_DEDUCT';
  amount: number;
  description: string;
  orderId?: string;
  createdAt: any; 
};

export type SupplierEntityType = 'JURISTIC' | 'INDIVIDUAL';
export type SupplierBranchType = 'HEAD' | 'BRANCH' | 'NONE';

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  taxId?: string;
  website?: string;
  fax?: string;
  status: 'active' | 'archived';
  createdAt: any;
  updatedAt?: any;

  isThaiRegistration?: boolean;
  entityType?: SupplierEntityType;
  branchType?: SupplierBranchType;
  juristicType?: string;
  individualType?: string;
  individualPrefix?: string;
  firstName?: string;
  lastName?: string;

  contactPrefix?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactNickname?: string;
  contactPosition?: string;
  contactPersonPhone?: string;
  contactPersonEmail?: string;
};

export type PurchaseOrderItem = {
  productVariantId: string;
  productGroupId: string;
  displayName: string; 
  sku: string; 
  quantity: number;
  cost: number; 
  quantityReceived: number;
};

export type PurchaseOrderTaxMode = 'INCLUSIVE' | 'EXCLUSIVE' | 'EXEMPT';

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus?: 'UNPAID' | 'PAID';
  paymentSlipUrl?: string; // Added for record keeping
  additionalImageUrls?: string[]; // Added for receipts/extra docs
  items: PurchaseOrderItem[];
  orderDate: any; 
  expectedDeliveryDate?: any; 
  notes?: string;
  subtotal: number;
  discountAmount?: number;
  shippingCost: number;
  otherCharges: number;
  taxRate?: number;
  taxAmount: number;
  taxMode?: PurchaseOrderTaxMode;
  grandTotal: number;
  createdAt: any; 
  updatedAt: any; 
};

export type StockMovement = {
  id: string;
  productVariantId: string;
  productGroupId: string;
  orderId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number; 
  reason: string; 
  createdAt: any;
};

export type AuditLog = {
  id: string;
  adminUserId: string;
  adminName: string;
  action: 'CONFIRM_PAYMENT' | 'UPDATE_SHIPMENT' | 'CANCEL_ORDER' | 'MANUAL_ADJUSTMENT' | 'EXPIRE_ORDER' | 'UPDATE_FEE';
  targetId: string; 
  details?: Record<string, any>;
  createdAt: any;
};

export type AuditLogAction = 'CONFIRM_PAYMENT' | 'UPDATE_SHIPMENT' | 'CANCEL_ORDER' | 'MANUAL_ADJUSTMENT' | 'EXPIRE_ORDER' | 'UPDATE_FEE';

export type ShippingRates = {
  baseRate: number; 
  stepRate: number; 
  blockRate: number; 
}

export type ProvincialShippingRate = {
  province: string;
  rates: ShippingRates;
};

export type AnnouncementFrequency = 'ONLY_ONCE' | 'EVERY_LOGIN';

export type QuizQuestion = {
  id: string; // for stable keys in UI
  question: string;
  options: string[];
  correctOptionIndex: number;
};

export type StoreMandatoryQuiz = {
  id: string; // generated using crypto.randomUUID()
  active: boolean;
  title: string;
  content?: string;
  imageUrl?: string;
  questions: QuizQuestion[];
  updatedAt?: any;
};

export type StoreAnnouncement = {
  active: boolean;
  title?: string;
  content?: string;
  imageUrl?: string;
  hasAckButton: boolean;
  frequency: AnnouncementFrequency;
  updatedAt?: any;
};

export type StoreSettings = {
  defaultShippingRates: ShippingRates,
  provincialShippingRates?: ProvincialShippingRate[],
  pointsRate: number,
  pointValue: number,
  defaultTaxRate: number;
  companyAddress?: SenderAddress;
  supportPhone?: string;
  supportLineId?: string;
  announcement?: StoreAnnouncement;
  mandatoryQuizzes?: StoreMandatoryQuiz[];
};

export type StoreBankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  isActive: boolean;
  createdAt?: any;
};

export type LabelTemplate = {
  id: string;
  templateName: string;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  createdAt: any;
};

export type GuestCustomer = {
  id: string;
  name: string;
  phone: string;
  addressLine1?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  lastPurchaseAt?: any;
};

// --- Communications ---

export type TargetedAnnouncementTarget = 'ALL_SELLERS' | 'BY_PROVINCE' | 'BY_REGION' | 'SPECIFIC_USERS';

export type TargetedAnnouncement = {
  id: string; 
  title: string;
  content?: string;
  imageUrl?: string;
  linkUrl?: string;
  linkLabel?: string;
  active: boolean;
  targetType: TargetedAnnouncementTarget;
  targetProvinces?: string[]; 
  targetRegions?: string[]; 
  targetUserIds?: string[]; 
  createdAt?: any;
  updatedAt?: any;
};
