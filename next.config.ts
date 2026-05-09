import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	async redirects() {
		return [
			{
				source: "/qr",
				destination: "/qr-olusturucu",
				permanent: false,
			},
			{
				source: "/qr-olustur",
				destination: "/qr-olusturucu",
				permanent: false,
			},
			{
				source: "/qr-oluşturucu",
				destination: "/qr-olusturucu",
				permanent: false,
			},
			{
				source: "/qr-olu%C5%9Fturucu",
				destination: "/qr-olusturucu",
				permanent: false,
			},
			{
				source: "/favicon.ico",
				destination: "/icon.svg",
				permanent: false,
			},
		];
	},
};

export default nextConfig;
