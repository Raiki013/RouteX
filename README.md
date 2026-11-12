RouteX – Bus Reservation and Tracking System

RouteX is a mobile-based bus reservation and tracking system developed to make bus travel more convenient, organized, and accessible. It allows passengers to book bus trips, manage reservations, receive digital tickets, and monitor bus locations. It also provides tools for bus operators and cashiers to manage trips, verify tickets, and handle passenger boarding.

Features

Passenger

User registration and login

Browse available bus trips

Select bus schedules and seats

Book bus reservations

View booking details and payment status

Receive digital boarding tickets with QR codes

Track active buses through GPS

View booking and ticket information

Bus Operator

Operator account access

View assigned buses

Manage and monitor bus trips

Start and end trips

Share bus GPS locations

Scan passenger boarding ticket QR codes

Verify payment and booking status

Record passenger boarding

Cashier

Scan passenger booking QR codes

Retrieve booking information

Verify reservations

Process and confirm payments

Administrator

Manage system users and roles

Manage bus and operator information

Monitor system records and activities

Technology Stack

Mobile Application

React Native

Expo

JavaScript

React Navigation

Expo Camera

Expo Location

Backend and Database

Supabase

PostgreSQL

Supabase Authentication

Supabase Realtime

Row Level Security (RLS)

Development Tools

Visual Studio Code

Git and GitHub

Expo Go / Expo Development Build

QR Code System

RouteX uses separate QR codes for different processes:

Booking QR Code: Used by cashiers to retrieve and verify passenger reservations.

Boarding Ticket QR Code: Used by bus operators to verify paid tickets and record passenger boarding.

GPS Tracking

RouteX uses device GPS to provide bus location updates during active trips. Passengers can view available bus location information through the Live Tracking feature.

User Roles

Role

Responsibilities

Passenger

Book trips, view tickets, track buses

Cashier

Verify bookings and process payments

Operator

Manage trips, track buses, scan boarding tickets

Admin

Manage users and system information

Installation and Setup

Clone the repository:

git clone YOUR_GITHUB_REPOSITORY_URL

Navigate to the project directory:

cd RouteX

Install dependencies:

npm install

Configure your Supabase connection in the project's environment/configuration files.

Start the Expo development server:

npx expo start

Project Status

RouteX is an ongoing academic software development project. Features and improvements are continuously being implemented and tested.

Developers

RouteX Development Team

Developed as an academic project using React Native, Expo, and Supabase.

RouteX – Making bus reservations and tracking easier.