# RouteX – Bus Reservation and Tracking System

RouteX is a mobile-based bus reservation and tracking system developed to improve the convenience, accessibility, and management of bus transportation. It provides passengers with a platform to browse available buses, make reservations, manage payments, receive digital tickets, and track buses through GPS technology.

The system also provides dedicated interfaces for bus operators and cashiers to manage bus docking, monitor trips, verify reservations, process payments, and validate passenger boarding tickets. An administrator dashboard provides centralized management of system users, buses, operators, and other records.

RouteX is developed using React Native, Expo, and Supabase, with real-time database synchronization and role-based access control.

---

## Features and Functionalities

### 1. Passenger Module

- User registration and login using Supabase Authentication.
- Password recovery and reset functionality.
- Browse available buses and transportation options.
- View bus information, including bus name, plate number, type, and passenger capacity.
- View bus availability and active trip destinations.
- Select available buses for reservation.
- Book bus reservations through the terminal booking process.
- View reservation details and payment status.
- Submit and manage payment information.
- Access digital booking and boarding tickets.
- Generate and display QR codes for ticket verification.
- Track active buses through GPS location updates.
- Receive push notifications about relevant booking and trip activities.
- View notifications and booking information.

### 2. Bus Operator Module

- Secure operator account access.
- View buses assigned to their accounts.
- Manage bus docking and departure activities.
- View and manage assigned bus trips.
- Set trip destinations.
- Start and end bus trips.
- Share GPS coordinates during active trips.
- Monitor trip status and bus information.
- Scan passenger boarding ticket QR codes.
- Verify passenger payment and ticket status.
- Record and validate passenger boarding.

### 3. Cashier Module

- Secure cashier account access.
- Access the cashier dashboard.
- Scan passenger booking QR codes.
- Retrieve reservation and passenger information.
- Verify booking details and reservation status.
- Review payment information.
- Process and confirm passenger payments.
- Update payment and booking records.

### 4. Administrator Module

- Manage system users and their accounts.
- Assign and manage user roles.
- Manage passenger, cashier, and operator accounts.
- Manage bus information and records.
- Manage operator information.
- Monitor system activities and records.
- Access centralized system management through the web-based administrator dashboard.

---

## User Roles and Responsibilities

| User Role | Responsibilities |
|---|---|
| Passenger | Browse buses, make reservations, process payments, view tickets, and track buses. |
| Cashier | Scan booking QR codes, verify reservations, and process payments. |
| Bus Operator | Manage bus docking and trips, share GPS locations, scan boarding tickets, and record passenger boarding. |
| Administrator | Manage users, roles, buses, operators, and system records. |

---

## Technology Stack

### Mobile Application

- React Native
- Expo
- JavaScript
- React Navigation
- Expo Camera
- Expo Location
- Expo Notifications
- React Native Maps
- Ionicons
- Material Community Icons

### Backend and Database

- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Realtime
- Supabase Row Level Security (RLS)
- Supabase Storage (where configured)

### Development Tools

- Visual Studio Code
- Git
- GitHub
- Node.js
- npm
- Expo CLI
- Expo Go
- Expo Development Build

### Administrator Dashboard

- Web-based administrator interface
- Supabase integration
- Vercel deployment

---

## QR Code System

RouteX implements separate QR code workflows for reservation verification and passenger boarding.

### Booking QR Code

Used by cashiers to:
- Scan passenger booking QR codes.
- Retrieve reservation information.
- Verify booking details.
- Check payment status.
- Process and confirm payments.

### Boarding Ticket QR Code

Used by bus operators to:
- Scan passenger boarding tickets.
- Retrieve ticket information.
- Verify payment and ticket validity.
- Validate passenger reservations.
- Record passenger boarding.

Separating these QR code processes helps organize reservation verification and actual passenger boarding.

---

## GPS Bus Tracking System

RouteX uses device GPS technology to provide bus location updates during trips.

The operator's device serves as the GPS location source.

### How It Works

1. The bus operator accesses the assigned bus.
2. The operator selects or manages the assigned trip.
3. The operator starts the trip.
4. The application obtains GPS coordinates from the operator's device.
5. Location information is sent to Supabase.
6. Passengers can view the bus location through the Live Tracking feature.
7. GPS updates continue according to the configured tracking process while the trip is active.
8. The operator ends the trip when the journey is completed.

The system uses Expo Location and Supabase Realtime to support location sharing and passenger tracking.

Background location functionality is also configured to support GPS updates when the application moves out of the foreground, subject to device permissions and operating system restrictions.

---

## Push Notification System

RouteX integrates Expo Notifications and Supabase to support mobile push notifications.

The notification system includes:

- Push token registration.
- Device platform identification.
- Storage of user push tokens in Supabase.
- Notification delivery to registered devices.
- Notification handling and navigation.
- Deep linking to relevant application screens.

Notifications help users access relevant booking, payment, and trip information.

---

## Authentication and Role-Based Access

RouteX uses Supabase Authentication for account registration, login, and session management.

The application implements role-based navigation to provide different interfaces depending on the authenticated user's role.

### Account Roles

- `user` – Passenger account.
- `operator` – Bus operator account.
- `cashier` – Cashier account.
- `admin` – Administrator account.

The application restores authenticated sessions and directs users to the appropriate screens based on their assigned roles.

Row Level Security (RLS) policies are used to control access to database records and help protect user information.

---

## Application Navigation

The mobile application uses React Navigation with stack and bottom-tab navigation.

### Main Screens

**Authentication**
- Login
- Signup
- Reset Password

**Passenger**
- Home
- Live Tracking
- Booking a Bus
- Profile
- Notifications
- Payment
- Ticket

**Cashier**
- Cashier Dashboard
- Payment
- Verification
- QR Scanner

**Bus Operator**
- Operator Docking
- Trip Management
- GCash
- Ticket Scanner

**Shared**
- Tracking

The application uses role-based initial navigation to direct cashiers to their dashboard while passengers and operators access the main tab navigation.

---

## Database and Backend

RouteX uses Supabase PostgreSQL as its primary database.

The backend supports authentication, reservation management, bus information, trip records, GPS tracking, payment processing, and notification registration.

The system uses Supabase Realtime to synchronize relevant information between application users.

Database functionality includes:

- User authentication and profile management.
- User roles and account information.
- Bus and operator assignments.
- Bus docking information.
- Bus trip management.
- Passenger reservations.
- Payment records.
- Ticket and boarding verification.
- GPS location records.
- Push notification tokens.

Database access is protected through Row Level Security policies and authenticated user permissions.

---

## Installation and Setup

### Prerequisites

Make sure the following are installed:

- Node.js
- npm
- Visual Studio Code
- Git
- Expo CLI or the ability to run Expo through npx
- Expo Go or an Expo Development Build

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
```

### 2. Navigate to the Project Directory

```bash
cd RouteX
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Supabase

Configure your Supabase project credentials in the application's environment or Supabase configuration files.

You will need:

- Supabase Project URL
- Supabase Anon/Publishable Key

Make sure the application is connected to the correct Supabase project and that the required database tables, authentication settings, and RLS policies are configured.

Never expose your Supabase service role key in the mobile application or commit private credentials to GitHub.

### 5. Start the Development Server

```bash
npx expo start
```

For development builds, use the appropriate Expo development build workflow.

**Note:** Features requiring native modules, such as certain camera, location, and notification configurations, may require an Expo Development Build instead of Expo Go.

---

## Project Structure

The project is organized into application screens, components, navigation, and supporting functionality.

```text
RouteX/
│
├── assets/
│
├── components/
│
├── screens/
│   ├── Login
│   ├── Signup
│   ├── ResetPassword
│   ├── Passenger
│   ├── Cashier
│   ├── Operator
│   └── Tracking
│
├── tasks/
│   └── backgroundLocation
│
├── supabase/
│
├── App.js
├── app.json
├── package.json
└── README.md
```

*The structure above is a general overview. Actual filenames and folders may differ depending on the current project organization.*

---

## Project Status

**Ongoing Academic Software Development Project**

RouteX is an ongoing academic project. Its mobile application, backend integration, role-based modules, reservation workflows, QR code verification, GPS tracking, and administrator dashboard are being developed and tested continuously.

Additional improvements, testing, and feature refinements are part of the development process.

---

## Developer

**Mars Zeus Emmanuel Salinga**

Developed as an academic software development project using React Native, Expo, and Supabase.

---

**RouteX – Making Bus Reservations and Tracking Easier.**