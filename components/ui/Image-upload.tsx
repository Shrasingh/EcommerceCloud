"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CldUploadWidget } from "next-cloudinary";
import { Button } from "@/components/ui/button";
import { ImagePlus, Trash } from "lucide-react";
// Must be an *unsigned* upload preset in your own Cloudinary account. There is
// no default: without this set, uploads are disabled rather than falling back
// to someone else's preset.
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

// Client-side limits for the unsigned widget. These complement (never
// replace) the restrictions configured on the preset itself in Cloudinary,
// which is the only enforcement an unsigned upload has server-side.
const UPLOAD_OPTIONS = {
  sources: ["local", "url", "camera"] as ("local" | "url" | "camera")[],
  multiple: false,
  maxFiles: 1,
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  clientAllowedFormats: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
  resourceType: "image",
};

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove: (value: string) => void;
  value: string[];
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  onRemove,
  value,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  const onUpload = (result: any) => {
    onChange(result.info.secure_url);
  };
  if (!isMounted) {
    return null;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        {value.map((url) => (
          <div
            key={url}
            className="relative w-[200px] rounded-md overflow-hidden "
          >
            <div className="z-10 absolute top-2 right-2 ">
              <Button
                type="button"
                onClick={() => onRemove(url)}
                variant="destructive"
                size="icon"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
            <Image height={200} width={200} className="object-cover" alt="Image" src={url} />
          </div>
        ))}
      </div>
      {!UPLOAD_PRESET ? (
        <div>
          <Button type="button" disabled variant="secondary">
            <ImagePlus className="h-4 w-4 mr-2" />
            Upload an Image
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">
            Image uploads are disabled: set <code>NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET</code> to an
            unsigned upload preset in your own Cloudinary account.
          </p>
        </div>
      ) : (
        <CldUploadWidget onSuccess={onUpload} uploadPreset={UPLOAD_PRESET} options={UPLOAD_OPTIONS}>
          {({ open }) => {
            const onClick = () => {
              open();
            };
            return (
              <Button
                type="button"
                disabled={disabled}
                variant="secondary"
                onClick={onClick}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                Upload an Image
              </Button>
            );
          }}
        </CldUploadWidget>
      )}
    </div>
  );
};
export default ImageUpload;
