const { z } = require('zod');
const { ALL_PROVINCES, ALL_DISTRICTS } = require('../constants/sierraLeoneAdmin');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const facilityType = z.enum(['national_referral', 'regional', 'district', 'community_health_center', 'clinic']);
const staffRole = z.enum(['doctor', 'pharmacist', 'nurse', 'store_officer', 'chw']);
const province = z.enum(ALL_PROVINCES, { message: `province must be one of: ${ALL_PROVINCES.join(', ')}` });

// Deliberately loose on username/password shape — those are handled by
// bcrypt/comparePassword and don't need format validation, only presence.
// Tightening here would just be redundant with the length check already in
// the route.
const loginSchema = z.object({
  username: z.string().trim().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

const mfaCodeSchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
  code: z.string().trim().min(1, 'code is required'),
});

const twoFactorEnableSchema = z.object({
  mfaToken: z.string().optional(), // absent when using the voluntary Bearer-token path
  code: z.string().trim().min(1, 'code is required'),
});

const twoFactorSetupSchema = z.object({
  mfaToken: z.string().optional(),
});

const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'password is required'),
  code: z.string().trim().min(1, 'code is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword is required'),
  newPassword: z.string().min(10, 'newPassword must be at least 10 characters'),
});

const createFacilitySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  code: z.string().trim().min(1, 'code is required').max(30),
  province: province.optional(),
  district: z.string().trim().min(1, 'district is required').max(100),
  chiefdom: z.string().trim().max(100).optional(),
  type: facilityType,
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  adminFullName: z.string().trim().min(1, 'adminFullName is required').max(200),
  adminEmail: z.string().trim().email('adminEmail must be a valid email address').optional().or(z.literal('')),
});

const updateFacilitySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    province: province.optional(),
    district: z.string().trim().min(1).max(100).optional(),
    chiefdom: z.string().trim().max(100).optional(),
    type: facilityType.optional(),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one editable field is required' });

const facilityStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], { message: "status must be 'active' or 'suspended'" }),
});

const createFacilityAdminSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(200),
  email: z.string().trim().email('email must be a valid email address').optional().or(z.literal('')),
});

const createSuperAdminSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(200),
  email: z.string().trim().email('email must be a valid email address').optional().or(z.literal('')),
});

// Broader than the facility-level staffStatusSchema — MoH-level admin
// management can also REVOKE an account outright (not just suspend it),
// per the escalation path facility admins are explicitly blocked from
// (see the 403 in the facility-level status route).
const adminStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'revoked'], { message: "status must be 'active', 'suspended', or 'revoked'" }),
});

const staffDirectoryQuerySchema = z.object({
  role: z.enum(['moh_super_admin', 'facility_admin', 'doctor', 'pharmacist', 'nurse', 'store_officer', 'chw']).optional(),
  facilityId: objectId.optional(),
  district: z.enum(ALL_DISTRICTS).optional(),
  province: province.optional(),
  status: z.enum(['active', 'suspended', 'revoked']).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const createStaffSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(200),
  email: z.string().trim().email('email must be a valid email address').optional().or(z.literal('')),
  role: staffRole,
});

const bulkStaffSchema = z.object({
  csv: z.string().min(1, 'csv (string) is required in the request body'),
});

const staffStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], { message: "status must be 'active' or 'suspended'" }),
});

const facilityIdParamSchema = z.object({ facilityId: objectId });
const userIdParamSchema = z.object({ userId: objectId });
const facilityAndUserIdParamSchema = z.object({ facilityId: objectId, userId: objectId });

module.exports = {
  loginSchema,
  mfaCodeSchema,
  twoFactorEnableSchema,
  twoFactorSetupSchema,
  twoFactorDisableSchema,
  refreshSchema,
  changePasswordSchema,
  createFacilitySchema,
  updateFacilitySchema,
  facilityStatusSchema,
  createFacilityAdminSchema,
  createSuperAdminSchema,
  adminStatusSchema,
  staffDirectoryQuerySchema,
  createStaffSchema,
  bulkStaffSchema,
  staffStatusSchema,
  facilityIdParamSchema,
  userIdParamSchema,
  facilityAndUserIdParamSchema,
};
