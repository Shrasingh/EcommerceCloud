import { getDashboardStats } from "@/actions/get-dashboard-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Heading from "@/components/ui/heading";
import Overview from "@/components/overview";
import { Separator } from "@/components/ui/separator";
import { formatter } from "@/lib/utils";
import { requireStoreAccess } from "@/lib/require-store";
import { CreditCardIcon, DollarSign, Package} from "lucide-react";

interface DashboardPageProps {
  params: Promise<{ storeId: string }>;
}

const DashboardPage: React.FC<DashboardPageProps> = async (props) => {
  const params = await props.params;
  await requireStoreAccess(params.storeId);

  const { totalRevenue, estimatedRevenue, estimatedItems, salesCount, stockCount, graphData } =
    await getDashboardStats(params.storeId);


  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Heading title="Dashboard" description="Overview of your store"/>
        <Separator/>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2" >
              <CardTitle className="text-sm font-medium" >
              Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {estimatedItems > 0 && "≈ "}
                {formatter.format(totalRevenue)}
              </div>
              {estimatedItems > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Includes {formatter.format(estimatedRevenue)} estimated from current prices for{" "}
                  {estimatedItems} {estimatedItems === 1 ? "item" : "items"} sold before prices were recorded.
                </p>
              )}
            </CardContent>
            
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2" >
              <CardTitle className="text-sm font-medium" >
              Sales
              </CardTitle>
              <CreditCardIcon className="h-4 w-4 text-muted-foreground"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                +{salesCount}
              </div>
            </CardContent>
            
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2" >
              <CardTitle className="text-sm font-medium" >
              Product In Stock
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stockCount}
              </div>
            </CardContent> 
          </Card>
          <Card className="md:col-span-3">
            <CardHeader >
              <CardTitle >
              Overview
              </CardTitle>
              {estimatedItems > 0 && (
                <p className="text-xs text-muted-foreground">
                  Monthly totals are partly estimated: orders placed before prices were recorded use current prices.
                </p>
              )}
            </CardHeader>
            <CardContent className="pl-2">
              <Overview data={graphData} />
            </CardContent>
            
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
