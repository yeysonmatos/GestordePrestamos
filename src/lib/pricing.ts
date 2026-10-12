import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PublicPlan = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  features: string[] | null;
  billing_cycle: string;
  is_active: boolean;
  max_clients: number | null;
};

export function usePublicPlans() {
  return useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,name,price,description,features,billing_cycle,is_active,max_clients")
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as PublicPlan[];
    },
    staleTime: 60_000,
  });
}