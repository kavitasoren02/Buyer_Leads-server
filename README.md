# Buyer Lead Intake App - Backend

A Node.js + Express.js backend for managing buyer leads.

## Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm

### Install Dependencies
```bash
npm install
```

### Environment Configuration
```bash
cp .env.example .env
```
Update `.env` with your database credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=buyer_leads
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your-super-secret-jwt-key
```

### Database Setup
```bash
createdb buyer_leads
npm run migrate
npm run seed
```

### Start Backend Server
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/demo-login`
- `GET /api/auth/me`

### Buyers
- `GET /api/buyers`
- `GET /api/buyers/:id`
- `POST /api/buyers`
- `PUT /api/buyers/:id`
- `DELETE /api/buyers/:id`
- `POST /api/buyers/import`
- `GET /api/buyers/export`

## CSV Format

### Import Format
```csv
fullName,email,phone,city,propertyType,bhk,purpose,budgetMin,budgetMax,timeline,source,notes,tags,status
John Doe,john@example.com,9876543210,Chandigarh,Apartment,3,Buy,5000000,7000000,0-3m,Website,"Looking for 3BHK","urgent,family",New
```

### Export Format
Same as import format plus timestamps and system fields.

## Testing
```bash
npm test
```

## Production Deployment

### Backend
1. Set production environment variables
2. Run migrations: `npm run migrate`
3. Start with PM2: `pm2 start server.js`

### Database
- Use managed PostgreSQL (AWS RDS, Google Cloud SQL, etc.)
- Enable SSL connections
- Set up automated backups

## Performance Considerations

- **Database Indexes**: Optimized for common queries
- **Pagination**: Server-side to handle large datasets
- **Rate Limiting**: Prevents abuse
- **Connection Pooling**: Efficient database connections
- **Caching**: Browser caching for static assets

## Security Measures

- **JWT Tokens**: Secure authentication
- **Input Validation**: Prevent injection attacks
- **CORS**: Controlled cross-origin requests
- **Rate Limiting**: DDoS protection
- **Environment Variables**: Secure configuration

## Future Enhancements

- [ ] Real-time notifications
- [ ] Advanced search with full-text indexing
- [ ] File attachments for leads
- [ ] Email integration
- [ ] Mobile app
- [ ] Analytics dashboard
- [ ] Automated lead scoring
- [ ] Integration with CRM systems

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## License

MIT License - see LICENSE file for details.