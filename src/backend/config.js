import dotenv from 'dotenv';

// Load .env if not in production
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod',
  jwtExpiresIn: '12h',
};
