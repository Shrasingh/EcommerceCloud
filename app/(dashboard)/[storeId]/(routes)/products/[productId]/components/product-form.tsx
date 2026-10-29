"use client";
import { getErrorMessage } from "@/lib/errors";
import axios from "axios";
import { Select ,SelectContent,SelectValue,SelectItem,SelectTrigger } from "@/components/ui/select"
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Product, Image, Category ,Color,Size} from "@prisma/client";
import { useForm } from "react-hook-form";
import Heading from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import {
  Form,
  FormControl,FormDescription,
  FormField,
  FormItem,
  FormMessage,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { AlertModal } from "@/components/modals/alert-modal";

import ImageUpload from "@/components/ui/Image-upload";
import { Checkbox } from "@/components/ui/checkbox";

// Mirrors `productSchema` in lib/validations.ts (the server re-validates).
const formSchema = z
  .object({
    name: z.string().min(1),
    images: z.object({ url: z.string({ message: "Image is required" }) }).array().min(1, "Add at least one image"),
    price: z.coerce.number<number>().positive("Price must be greater than 0"),
    categoryId: z.string().min(1),
    colorId: z.string().min(1),
    sizeId: z.string().min(1),
    isFeatured: z.boolean().default(false).optional(),
    isArchived: z.boolean().default(false).optional(),
    isInStock: z.boolean().default(true).optional(),
    // Storefront details; empty means "not set" and is sent as null.
    description: z.string().max(5000, "At most 5000 characters").optional(),
    brand: z.string().max(100, "At most 100 characters").optional(),
    originalPrice: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? null : v),
      z.coerce.number<number>().positive("Original price must be greater than 0").nullable()
    ),
  })
  .refine((p) => p.originalPrice === null || p.originalPrice > p.price, {
    message: "Original price must be greater than the price",
    path: ["originalPrice"],
  });

type ProductFormValues = z.infer<typeof formSchema>;
interface ProductFormProps {
  initialData:
    | (Product & {
        images: Image[];
      })
    | null;
    categories: Category[];
    colors: Color[];
    sizes: Size[];
}
export const ProductForm: React.FC<ProductFormProps> = ({
   initialData,
  categories,
colors,
sizes }) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const title = initialData ? "Edit product" : "Create product";
  const description = initialData ? "Edit a product" : "Add a new product";
  const toastMessage = initialData ? "Product updated" : "Product created";
  const action = initialData ? "Save changes" : "Create";
  // zod 4 forms can differ in input/output types (e.g. defaults), so pass both.
  const form = useForm<z.input<typeof formSchema>, unknown, ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          images: initialData.images.map(({ url }) => ({ url })),
          price: parseFloat(String(initialData.price)),
          categoryId: initialData.categoryId,
          colorId: initialData.colorId,
          sizeId: initialData.sizeId,
          isFeatured: initialData.isFeatured,
          isArchived: initialData.isArchived,
          isInStock: initialData.isInStock,
          description: initialData.description ?? "",
          brand: initialData.brand ?? "",
          originalPrice: initialData.originalPrice === null ? "" : String(initialData.originalPrice),
        }
      : {
          name: "",
          images: [],
          price: 0,
          categoryId: "",
          colorId: "",
          sizeId: "",
          isFeatured: false,
          isArchived: false,
          isInStock: true,
          description: "",
          brand: "",
          originalPrice: "",
        },
  });
  const onSubmit = async (data: ProductFormValues) => {
    // Blank text clears the field server-side (stored as NULL).
    const payload = {
      ...data,
      description: data.description?.trim() || null,
      brand: data.brand?.trim() || null,
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/products/${params.productId}`,
          payload
        );
      } else {
        await axios.post(`/api/${params.storeId}/products`, payload);
      }
      router.refresh();
      router.push(`/${params.storeId}/products`);
      toast.success(toastMessage);
    } catch (error) {
      toast.error(getErrorMessage(error, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  };
  const ondelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/products/${params.productId}`
      );
      router.refresh();
      router.push(`/${params.storeId}/products`);
      toast.success("Product deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };
  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={ondelete}
        loading={loading}
      />
      <div className=" flex items-center justify-between">
        <Heading title={title} description={description} />
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="icon"
            aria-label="Delete product"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4  " />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <FormField
            control={form.control}
            name="images"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Images </FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value.map((image) => image.url)}
                    disabled={loading}
                    onChange={(url) =>
                      field.onChange([...field.value, { url }])
                    }
                    onRemove={(url) =>
                      field.onChange([
                        ...field.value.filter((current) => current.url !== url),
                      ])
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Product name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={loading}
                      placeholder="9.99"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="originalPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Original price (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={loading}
                      placeholder="Leave empty if not on sale"
                      {...field}
                      value={field.value === null || field.value === undefined ? "" : String(field.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    Shown struck through next to the price; must be higher than the price
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand (optional)</FormLabel>
                  <FormControl>
                    <Input disabled={loading} placeholder="Brand" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a category"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    { categories.map (( category ) =>
                      (
                        <SelectItem
                        key={category.id}
                        value={category.id}
                        >
{category.name}
                        </SelectItem>                     ))
                      }
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sizeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Size</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a size"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    { sizes.map (( size ) =>
                      (
                        <SelectItem
                        key={size.id}
                        value={size.id}
                        >
{size.name}
                        </SelectItem>                     ))
                      }
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="colorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a color"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    { colors.map (( color ) =>
                      (
                        <SelectItem
                        key={color.id}
                        value={color.id}
                        >
{color.name}
                        </SelectItem>                     ))
                      }
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <textarea
                      disabled={loading}
                      rows={4}
                      placeholder="What the shopper sees on the product page"
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                 <FormControl>
                  <Checkbox
                  checked = {field.value}
                  onCheckedChange={field.onChange}
                  />
                 </FormControl>
                 <div className="space-y-1 leading-none">
                  <FormLabel>
                    Featured
                  </FormLabel>
                  <FormDescription>
                    This product will appear on home page
                  </FormDescription>
                 </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isArchived"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                 <FormControl>
                  <Checkbox
                  checked = {field.value}
                  onCheckedChange={field.onChange}
                  />
                 </FormControl>
                 <div className="space-y-1 leading-none">
                  <FormLabel>
                    Archived
                  </FormLabel>
                  <FormDescription>
                    This product will not appear anywhere in the store
                  </FormDescription>
                 </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isInStock"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                 <FormControl>
                  <Checkbox
                  checked = {field.value}
                  onCheckedChange={field.onChange}
                  />
                 </FormControl>
                 <div className="space-y-1 leading-none">
                  <FormLabel>
                    In stock
                  </FormLabel>
                  <FormDescription>
                    Unchecked products stay visible but cannot be added to the cart or bought
                  </FormDescription>
                 </div>
                </FormItem>
              )}
            />

          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
