"use client";
import Image from "next/image";
import Link from "next/link";
import React from "react";

type Props = { size?: number };

export default function BrandLogo({ size = 28 }: Props) {
  return (
    <Link href="/" aria-label="Exla home" className="inline-flex items-center gap-2">
      <Image src="/brand/logo.svg" alt="Exla" width={size} height={size} priority />
      <span className="font-semibold text-brand">Exla</span>
    </Link>
  );
}


